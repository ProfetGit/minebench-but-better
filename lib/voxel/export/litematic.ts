import { gunzipSync, gzipSync } from "fflate";
import type { BlockState, ResolvedBlock } from "@/lib/palette/types";
import { NbtWriter } from "@/lib/voxel/export/nbt";
import {
  expectCompound,
  expectInt,
  expectList,
  expectLongArray,
  expectString,
  readNbt,
  NbtFormatError,
  type NbtCompound,
} from "@/lib/voxel/export/nbtRead";

// Litematica schematic, verified against the mod's own source rather than from
// memory: maruohon/litematica, branch pre-rewrite/fabric/1.20.x,
// src/main/java/fi/dy/masa/litematica/schematic/LitematicaSchematic.java and
// schematic/container/*.
//
// - SCHEMATIC_VERSION 6, SCHEMATIC_VERSION_SUB 1
// - gzipped NBT with an empty root name (NbtIo.writeCompressed)
// - index = y * (sizeX * sizeZ) + z * sizeX + x
//   (LitematicaBlockStateContainer.getIndex)
// - bitsPerEntry = max(2, ceil(log2(paletteSize))), entries packed least
//   significant bit first and spanning long boundaries (LitematicaBitArray)
// - palette entry 0 is always minecraft:air
export const LITEMATIC_VERSION = 6;
export const LITEMATIC_SUB_VERSION = 1;

// Minecraft 1.21. Checked against the version summary in misode/mcmeta rather
// than assumed. The Sponge .schem writer still pins 3465 (1.20.1); the two
// exporters deliberately disagree until that one is updated.
export const LITEMATIC_DATA_VERSION = 3953;

export const AIR = "minecraft:air";
export const DEFAULT_REGION_NAME = "Main";

const MAX_VOLUME = 32_000_000;

export type LitematicOptions = {
  name?: string;
  author?: string;
  description?: string;
  regionName?: string;
  timeCreated?: number;
  timeModified?: number;
};

export type LitematicStats = {
  width: number;
  height: number;
  length: number;
  volume: number;
  blockCount: number;
  paletteSize: number;
  bitsPerEntry: number;
  origin: { x: number; y: number; z: number };
};

export type LitematicExport = {
  bytes: Uint8Array;
  stats: LitematicStats;
};

export function bitsPerEntry(paletteSize: number): number {
  return Math.max(2, Math.ceil(Math.log2(Math.max(paletteSize, 1))));
}

function stateKey(id: string, state?: BlockState): string {
  if (!state) return id;
  const entries = Object.entries(state)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return id;
  return `${id}[${entries.map(([key, value]) => `${key}=${value}`).join(",")}]`;
}

type PaletteEntry = { id: string; state?: BlockState };

export function packBlockStates(indices: readonly number[], bits: number): bigint[] {
  const longCount = Math.ceil((indices.length * bits) / 64);
  const longs = new Array<bigint>(longCount).fill(0n);
  const mask = (1n << BigInt(bits)) - 1n;

  for (let entry = 0; entry < indices.length; entry += 1) {
    const value = BigInt(indices[entry] ?? 0) & mask;
    const startOffset = entry * bits;
    const startIndex = Math.floor(startOffset / 64);
    const endIndex = Math.floor((startOffset + bits - 1) / 64);
    const bitOffset = BigInt(startOffset % 64);

    longs[startIndex] = ((longs[startIndex] ?? 0n) | (value << bitOffset)) & 0xffffffffffffffffn;

    if (startIndex !== endIndex) {
      const carried = 64n - bitOffset;
      longs[endIndex] = ((longs[endIndex] ?? 0n) | (value >> carried)) & 0xffffffffffffffffn;
    }
  }

  // NBT longs are signed, so anything with the top bit set is written as its
  // negative counterpart.
  return longs.map((value) => BigInt.asIntN(64, value));
}

export function unpackBlockStates(longs: readonly bigint[], bits: number, count: number): number[] {
  const mask = (1n << BigInt(bits)) - 1n;
  const out: number[] = [];

  for (let entry = 0; entry < count; entry += 1) {
    const startOffset = entry * bits;
    const startIndex = Math.floor(startOffset / 64);
    const endIndex = Math.floor((startOffset + bits - 1) / 64);
    const bitOffset = BigInt(startOffset % 64);
    const start = BigInt.asUintN(64, longs[startIndex] ?? 0n);

    if (startIndex === endIndex) {
      out.push(Number((start >> bitOffset) & mask));
      continue;
    }

    const end = BigInt.asUintN(64, longs[endIndex] ?? 0n);
    const carried = 64n - bitOffset;
    out.push(Number(((start >> bitOffset) | (end << carried)) & mask));
  }

  return out;
}

export function buildLitematic(
  blocks: readonly ResolvedBlock[],
  options: LitematicOptions = {},
): LitematicExport {
  if (blocks.length === 0) throw new Error("No blocks to export");

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const byPosition = new Map<string, ResolvedBlock>();
  for (const block of blocks) {
    byPosition.set(`${block.x},${block.y},${block.z}`, block);
    if (block.x < minX) minX = block.x;
    if (block.y < minY) minY = block.y;
    if (block.z < minZ) minZ = block.z;
    if (block.x > maxX) maxX = block.x;
    if (block.y > maxY) maxY = block.y;
    if (block.z > maxZ) maxZ = block.z;
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const length = maxZ - minZ + 1;
  const volume = width * height * length;
  if (!Number.isFinite(volume) || volume <= 0) throw new Error("Invalid litematic bounds");
  if (volume > MAX_VOLUME) {
    throw new Error(`Litematica export is too large (${volume.toLocaleString()} cells)`);
  }

  const counts = new Map<string, number>();
  const entries = new Map<string, PaletteEntry>();
  for (const block of byPosition.values()) {
    const key = stateKey(block.id, block.state);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!entries.has(key)) entries.set(key, { id: block.id, state: block.state });
  }

  // Air first, then the rest by descending use so the common blocks sit at the
  // low indices. The order is fully determined by the input.
  const orderedKeys = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
  const palette: PaletteEntry[] = [{ id: AIR }, ...orderedKeys.map((key) => entries.get(key)!)];
  const indexOf = new Map<string, number>(orderedKeys.map((key, index) => [key, index + 1]));

  const indices = new Array<number>(volume).fill(0);
  for (const block of byPosition.values()) {
    const x = block.x - minX;
    const y = block.y - minY;
    const z = block.z - minZ;
    indices[y * (width * length) + z * width + x] = indexOf.get(stateKey(block.id, block.state)) ?? 0;
  }

  const bits = bitsPerEntry(palette.length);
  const longs = packBlockStates(indices, bits);

  const now = Date.now();
  const timeCreated = options.timeCreated ?? now;
  const timeModified = options.timeModified ?? timeCreated;
  const regionName = options.regionName ?? DEFAULT_REGION_NAME;

  const writer = new NbtWriter();
  writer.namedCompound("", () => {
    writer.namedInt("MinecraftDataVersion", LITEMATIC_DATA_VERSION);
    writer.namedInt("Version", LITEMATIC_VERSION);
    writer.namedInt("SubVersion", LITEMATIC_SUB_VERSION);

    writer.namedCompound("Metadata", () => {
      writer.namedString("Name", options.name ?? "Build");
      writer.namedString("Author", options.author ?? "");
      writer.namedString("Description", options.description ?? "");
      writer.namedInt("RegionCount", 1);
      writer.namedInt("TotalVolume", volume);
      writer.namedInt("TotalBlocks", byPosition.size);
      writer.namedLong("TimeCreated", timeCreated);
      writer.namedLong("TimeModified", timeModified);
      writeVec3(writer, "EnclosingSize", width, height, length);
    });

    writer.namedCompound("Regions", () => {
      writer.namedCompound(regionName, () => {
        writer.namedListOfCompounds("BlockStatePalette", palette.length, (index) => {
          const entry = palette[index];
          writer.namedString("Name", entry?.id ?? AIR);
          const state = entry?.state;
          if (state && Object.keys(state).length > 0) {
            writer.namedCompound("Properties", () => {
              for (const key of Object.keys(state).sort()) {
                writer.namedString(key, String(state[key]));
              }
            });
          }
        });
        writer.namedLongArray("BlockStates", longs);
        writer.namedEmptyList("TileEntities", 10);
        writer.namedEmptyList("Entities", 10);
        writeVec3(writer, "Position", 0, 0, 0);
        writeVec3(writer, "Size", width, height, length);
      });
    });
  });

  return {
    bytes: gzipSync(writer.toUint8Array()),
    stats: {
      width,
      height,
      length,
      volume,
      blockCount: byPosition.size,
      paletteSize: palette.length,
      bitsPerEntry: bits,
      origin: { x: minX, y: minY, z: minZ },
    },
  };
}

function writeVec3(writer: NbtWriter, name: string, x: number, y: number, z: number): void {
  writer.namedCompound(name, () => {
    writer.namedInt("x", x);
    writer.namedInt("y", y);
    writer.namedInt("z", z);
  });
}

export type LitematicReadResult = {
  version: number;
  subVersion: number;
  dataVersion: number;
  regionName: string;
  size: { width: number; height: number; length: number };
  metadata: {
    name: string;
    author: string;
    description: string;
    regionCount: number;
    totalVolume: number;
    totalBlocks: number;
  };
  palette: PaletteEntry[];
  blocks: ResolvedBlock[];
};

// Reads back what buildLitematica wrote. Used by the round trip test, and it is
// the half an importer would need later.
export function readLitematic(bytes: Uint8Array): LitematicReadResult {
  const document = readNbt(gunzipSync(bytes));
  const root = document.value;

  const version = expectInt(root.Version, "Version");
  const metadata = expectCompound(root.Metadata, "Metadata");
  const regions = expectCompound(root.Regions, "Regions");
  const regionNames = Object.keys(regions);
  const regionName = regionNames[0];
  if (!regionName) throw new NbtFormatError("The schematic has no regions");
  const region = expectCompound(regions[regionName], `Regions.${regionName}`);

  const size = expectCompound(region.Size, "Size");
  const width = Math.abs(expectInt(size.x, "Size.x"));
  const height = Math.abs(expectInt(size.y, "Size.y"));
  const length = Math.abs(expectInt(size.z, "Size.z"));

  const paletteList = expectList(region.BlockStatePalette, "BlockStatePalette");
  const palette: PaletteEntry[] = paletteList.map((item, index) => {
    const compound = expectCompound(item, `BlockStatePalette.${index}`);
    const id = expectString(compound.Name, `BlockStatePalette.${index}.Name`);
    if (compound.Properties === undefined) return { id };
    const properties = expectCompound(compound.Properties, `BlockStatePalette.${index}.Properties`);
    const state: BlockState = {};
    for (const key of Object.keys(properties)) {
      state[key] = expectString(properties[key], `BlockStatePalette.${index}.Properties.${key}`);
    }
    return { id, state };
  });

  const longs = expectLongArray(region.BlockStates, "BlockStates");
  const volume = width * height * length;
  const indices = unpackBlockStates(longs, bitsPerEntry(palette.length), volume);

  const position = expectCompound(region.Position, "Position");
  const originX = expectInt(position.x, "Position.x");
  const originY = expectInt(position.y, "Position.y");
  const originZ = expectInt(position.z, "Position.z");

  const blocks: ResolvedBlock[] = [];
  for (let index = 0; index < volume; index += 1) {
    const paletteIndex = indices[index] ?? 0;
    const entry = palette[paletteIndex];
    if (!entry || entry.id === AIR) continue;
    const y = Math.floor(index / (width * length));
    const rest = index - y * width * length;
    const z = Math.floor(rest / width);
    const x = rest - z * width;
    blocks.push({
      x: x + originX,
      y: y + originY,
      z: z + originZ,
      ...(entry.state ? { id: entry.id, state: entry.state } : { id: entry.id }),
    });
  }

  return {
    version,
    subVersion: expectInt(root.SubVersion, "SubVersion"),
    dataVersion: expectInt(root.MinecraftDataVersion, "MinecraftDataVersion"),
    regionName,
    size: { width, height, length },
    metadata: {
      name: expectString(metadata.Name, "Metadata.Name"),
      author: expectString(metadata.Author, "Metadata.Author"),
      description: expectString(metadata.Description, "Metadata.Description"),
      regionCount: expectInt(metadata.RegionCount, "Metadata.RegionCount"),
      totalVolume: expectInt(metadata.TotalVolume, "Metadata.TotalVolume"),
      totalBlocks: expectInt(metadata.TotalBlocks, "Metadata.TotalBlocks"),
    },
    palette,
    blocks,
  };
}

export function isGzipped(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}
