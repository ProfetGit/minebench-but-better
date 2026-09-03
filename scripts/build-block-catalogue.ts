import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { oklabLightness } from "@/lib/palette/oklab";

// The catalogue is the block-side half of the palette layer: namespaced ids,
// which stair and slab variants each block has, a cost weight, and an average
// colour taken from the shipped texture pack so the palette editor can show a
// swatch and so ramps can be ordered by perceptual lightness.
//
// Cost weights are per block placed and describe how much work a block is to
// acquire in survival, not its trade value. They are deliberately coarse.

type FamilySpec = {
  base: string;
  name: string;
  cost: number;
  stairs?: string;
  slab?: string;
  states?: string[];
  texture?: string;
};

const WOODS = ["oak", "spruce", "birch", "dark_oak"] as const;

const FAMILIES: FamilySpec[] = [
  ...WOODS.flatMap<FamilySpec>((wood) => [
    {
      base: `${wood}_planks`,
      name: title(`${wood} planks`),
      cost: 1,
      stairs: `${wood}_stairs`,
      slab: `${wood}_slab`,
    },
    { base: `${wood}_log`, name: title(`${wood} log`), cost: 1, states: ["axis"] },
    {
      base: `stripped_${wood}_log`,
      name: title(`stripped ${wood} log`),
      cost: 1,
      states: ["axis"],
    },
    { base: `${wood}_door`, name: title(`${wood} door`), cost: 2, states: ["facing", "half"], texture: `${wood}_door_bottom` },
  ]),

  { base: "stone", name: "Stone", cost: 1, stairs: "stone_stairs", slab: "stone_slab" },
  {
    base: "cobblestone",
    name: "Cobblestone",
    cost: 1,
    stairs: "cobblestone_stairs",
    slab: "cobblestone_slab",
  },
  {
    base: "mossy_cobblestone",
    name: "Mossy Cobblestone",
    cost: 2,
    stairs: "mossy_cobblestone_stairs",
    slab: "mossy_cobblestone_slab",
  },
  {
    base: "stone_bricks",
    name: "Stone Bricks",
    cost: 2,
    stairs: "stone_brick_stairs",
    slab: "stone_brick_slab",
  },
  {
    base: "mossy_stone_bricks",
    name: "Mossy Stone Bricks",
    cost: 2,
    stairs: "mossy_stone_brick_stairs",
    slab: "mossy_stone_brick_slab",
  },
  { base: "cracked_stone_bricks", name: "Cracked Stone Bricks", cost: 2 },
  { base: "smooth_stone", name: "Smooth Stone", cost: 2, slab: "smooth_stone_slab" },
  {
    base: "andesite",
    name: "Andesite",
    cost: 1,
    stairs: "andesite_stairs",
    slab: "andesite_slab",
  },
  {
    base: "polished_andesite",
    name: "Polished Andesite",
    cost: 2,
    stairs: "polished_andesite_stairs",
    slab: "polished_andesite_slab",
  },
  { base: "granite", name: "Granite", cost: 1, stairs: "granite_stairs", slab: "granite_slab" },
  {
    base: "polished_granite",
    name: "Polished Granite",
    cost: 2,
    stairs: "polished_granite_stairs",
    slab: "polished_granite_slab",
  },
  { base: "diorite", name: "Diorite", cost: 1, stairs: "diorite_stairs", slab: "diorite_slab" },
  {
    base: "polished_diorite",
    name: "Polished Diorite",
    cost: 2,
    stairs: "polished_diorite_stairs",
    slab: "polished_diorite_slab",
  },
  { base: "deepslate", name: "Deepslate", cost: 2, states: ["axis"] },
  {
    base: "cobbled_deepslate",
    name: "Cobbled Deepslate",
    cost: 2,
    stairs: "cobbled_deepslate_stairs",
    slab: "cobbled_deepslate_slab",
  },
  {
    base: "polished_deepslate",
    name: "Polished Deepslate",
    cost: 3,
    stairs: "polished_deepslate_stairs",
    slab: "polished_deepslate_slab",
  },
  {
    base: "deepslate_bricks",
    name: "Deepslate Bricks",
    cost: 3,
    stairs: "deepslate_brick_stairs",
    slab: "deepslate_brick_slab",
  },
  {
    base: "deepslate_tiles",
    name: "Deepslate Tiles",
    cost: 3,
    stairs: "deepslate_tile_stairs",
    slab: "deepslate_tile_slab",
  },
  { base: "bricks", name: "Bricks", cost: 3, stairs: "brick_stairs", slab: "brick_slab" },
  { base: "mud_bricks", name: "Mud Bricks", cost: 2, stairs: "mud_brick_stairs", slab: "mud_brick_slab" },
  {
    base: "sandstone",
    name: "Sandstone",
    cost: 1,
    stairs: "sandstone_stairs",
    slab: "sandstone_slab",
  },
  {
    base: "red_sandstone",
    name: "Red Sandstone",
    cost: 1,
    stairs: "red_sandstone_stairs",
    slab: "red_sandstone_slab",
  },
  {
    base: "nether_bricks",
    name: "Nether Bricks",
    cost: 4,
    stairs: "nether_brick_stairs",
    slab: "nether_brick_slab",
  },
  { base: "terracotta", name: "Terracotta", cost: 2 },
  { base: "white_terracotta", name: "White Terracotta", cost: 3 },
  { base: "quartz_block", name: "Quartz Block", cost: 6, stairs: "quartz_stairs", slab: "quartz_slab" },
  { base: "glass", name: "Glass", cost: 2 },
  { base: "tinted_glass", name: "Tinted Glass", cost: 6 },
  { base: "gravel", name: "Gravel", cost: 1 },
  { base: "clay", name: "Clay", cost: 1 },
  { base: "moss_block", name: "Moss Block", cost: 2 },
  { base: "dirt", name: "Dirt", cost: 1 },
  { base: "grass_block", name: "Grass Block", cost: 1, texture: "grass_block_side" },
  { base: "glowstone", name: "Glowstone", cost: 12 },
  { base: "sea_lantern", name: "Sea Lantern", cost: 15 },
  { base: "shroomlight", name: "Shroomlight", cost: 10 },
  { base: "copper_block", name: "Copper Block", cost: 8 },
  { base: "oxidized_copper", name: "Oxidized Copper", cost: 8 },
  { base: "iron_block", name: "Iron Block", cost: 45 },
  { base: "gold_block", name: "Gold Block", cost: 90 },
  { base: "obsidian", name: "Obsidian", cost: 10 },
];

export type CatalogueEntry = {
  id: string;
  name: string;
  texture: string;
  cost: number;
  states: string[];
  variants: { stairs?: string; slab?: string };
  color: { r: number; g: number; b: number; lightness: number };
};

const TEXTURE_DIR = join(
  process.cwd(),
  "assets",
  "texture-pack",
  "assets",
  "minecraft",
  "textures",
  "block",
);

export const CATALOGUE_PATH = join(process.cwd(), "lib", "palette", "catalogue.generated.json");

function title(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function textureCandidates(base: string, override?: string): string[] {
  if (override) return [override, base, `${base}_side`, `${base}_top`];
  return [base, `${base}_side`, `${base}_top`, `${base}_bottom`];
}

function resolveTexture(base: string, override?: string): string | null {
  for (const candidate of textureCandidates(base, override)) {
    if (existsSync(join(TEXTURE_DIR, `${candidate}.png`))) return candidate;
  }
  return null;
}

// Fully transparent pixels are skipped so a cutout texture does not average
// toward whatever the file happens to store behind the alpha.
async function averageColor(texture: string): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(join(TEXTURE_DIR, `${texture}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let r = 0;
  let g = 0;
  let b = 0;
  let counted = 0;
  const channels = info.channels;
  // Animated textures are a vertical strip of frames; the first frame is enough
  // and keeps the average stable across pack updates that add frames.
  const frameHeight = Math.min(info.height, info.width);

  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * channels;
      const alpha = data[offset + 3] ?? 255;
      if (alpha < 8) continue;
      r += data[offset] ?? 0;
      g += data[offset + 1] ?? 0;
      b += data[offset + 2] ?? 0;
      counted += 1;
    }
  }

  if (counted === 0) return { r: 0, g: 0, b: 0 };
  return {
    r: Math.round(r / counted),
    g: Math.round(g / counted),
    b: Math.round(b / counted),
  };
}

async function entryFor(
  id: string,
  name: string,
  texture: string,
  cost: number,
  states: string[],
  variants: { stairs?: string; slab?: string },
): Promise<CatalogueEntry> {
  const color = await averageColor(texture);
  return {
    id: `minecraft:${id}`,
    name,
    texture,
    cost,
    states,
    variants: {
      ...(variants.stairs ? { stairs: `minecraft:${variants.stairs}` } : {}),
      ...(variants.slab ? { slab: `minecraft:${variants.slab}` } : {}),
    },
    color: { ...color, lightness: Number(oklabLightness(color).toFixed(6)) },
  };
}

async function main(): Promise<void> {
  const entries: CatalogueEntry[] = [];
  const missing: string[] = [];

  for (const family of FAMILIES) {
    const texture = resolveTexture(family.base, family.texture);
    if (!texture) {
      missing.push(family.base);
      continue;
    }

    entries.push(
      await entryFor(family.base, family.name, texture, family.cost, family.states ?? [], {
        stairs: family.stairs,
        slab: family.slab,
      }),
    );

    if (family.stairs) {
      entries.push(
        await entryFor(
          family.stairs,
          `${family.name} Stairs`,
          texture,
          family.cost,
          ["facing", "half", "shape"],
          {},
        ),
      );
    }

    if (family.slab) {
      entries.push(
        await entryFor(family.slab, `${family.name} Slab`, texture, family.cost, ["type"], {}),
      );
    }
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(CATALOGUE_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf8");

  process.stdout.write(`Wrote ${entries.length} blocks to ${CATALOGUE_PATH}\n`);
  if (missing.length > 0) {
    process.stdout.write(`No texture found, skipped: ${missing.join(", ")}\n`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("build-block-catalogue.ts")) {
  void main();
}
