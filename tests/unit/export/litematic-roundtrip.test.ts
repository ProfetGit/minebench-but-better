import assert from "node:assert/strict";
import { compile } from "../../../lib/compile/compile";
import { buildProgram } from "../../../lib/dsl/api";
import { palettePreset } from "../../../lib/palette/presets";
import { resolve } from "../../../lib/palette/resolve";
import type { ResolvedBlock } from "../../../lib/palette/types";
import {
  bitsPerEntry,
  buildLitematic,
  isGzipped,
  packBlockStates,
  readLitematic,
  unpackBlockStates,
  LITEMATIC_DATA_VERSION,
  LITEMATIC_SUB_VERSION,
  LITEMATIC_VERSION,
} from "../../../lib/voxel/export/litematic";

function keyOf(block: ResolvedBlock): string {
  const state = block.state
    ? `[${Object.entries(block.state)
        .map(([key, value]) => `${key}=${value}`)
        .sort()
        .join(",")}]`
    : "";
  return `${block.id}${state}`;
}

// The pinned schematic version, taken from Litematica's own source.
assert.equal(LITEMATIC_VERSION, 6);
assert.equal(LITEMATIC_SUB_VERSION, 1);
// Minecraft 1.21, taken from the version summary rather than from memory.
assert.equal(LITEMATIC_DATA_VERSION, 3953);

// Bits per entry follows LitematicaBlockStateContainer: at least 2, otherwise
// enough bits for the palette.
assert.equal(bitsPerEntry(1), 2);
assert.equal(bitsPerEntry(4), 2);
assert.equal(bitsPerEntry(5), 3);
assert.equal(bitsPerEntry(16), 4);
assert.equal(bitsPerEntry(17), 5);

// Entries span long boundaries, so the packing has to be checked at bit widths
// that do not divide 64.
for (const bits of [2, 3, 5, 7, 11]) {
  const max = (1 << bits) - 1;
  const indices = Array.from({ length: 500 }, (_, index) => (index * 37) % (max + 1));
  const packed = packBlockStates(indices, bits);
  assert.equal(packed.length, Math.ceil((indices.length * bits) / 64));
  assert.deepEqual(unpackBlockStates(packed, bits, indices.length), indices);
}

// A value with the top bit of a long set survives the signed round trip.
{
  const indices = Array.from({ length: 64 }, () => 0xffff);
  const packed = packBlockStates(indices, 16);
  assert.ok(packed.some((value) => value < 0n));
  assert.deepEqual(unpackBlockStates(packed, 16, indices.length), indices);
}

// The real round trip: write a build, read it back, and compare block for
// block including every state property.
{
  const grid = compile(
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 11, d: 9 });
      m.storeys({ count: 2, height: 4 });
      m.foundation({ role: "foundation", depth: 1 });
      m.floor({ storey: 0, role: "floor" });
      m.floor({ storey: 1, role: "floor" });
      m.walls({ role: "wall_primary" });
      m.corners({ role: "structure_post" });
      m.mirrorX(() => {
        m.window({ face: "north", x: 3, y: 2, w: 1, h: 2, role: "glass" });
      });
      m.platform({ x: 0, z: 5, w: 3, d: 1, y: 1, role: "trim", form: "slab" });
      m.stairsRun({ from: { x: -2, y: 5, z: 0 }, to: { x: 0, y: 7, z: 0 }, role: "floor" });
      m.gableRoof({
        axis: "x",
        pitch: 1,
        overhang: 1,
        role: "roof_primary",
        trimRole: "roof_trim",
        infillRole: "wall_primary",
      });
      m.door({ face: "south", x: 0, role: "door" });
    }),
  );

  const resolved = resolve(grid, palettePreset("spruce-survival"));
  const written = buildLitematic(resolved.blocks, {
    name: "Round trip",
    author: "tests",
    description: "written and read back",
    timeCreated: 1_700_000_000_000,
  });

  assert.ok(isGzipped(written.bytes), "the file must be gzipped NBT");

  const read = readLitematic(written.bytes);

  assert.equal(read.version, LITEMATIC_VERSION);
  assert.equal(read.subVersion, LITEMATIC_SUB_VERSION);
  assert.equal(read.dataVersion, LITEMATIC_DATA_VERSION);
  assert.equal(read.regionName, "Main");
  assert.equal(read.metadata.name, "Round trip");
  assert.equal(read.metadata.author, "tests");
  assert.equal(read.metadata.description, "written and read back");
  assert.equal(read.metadata.regionCount, 1);
  assert.equal(read.metadata.totalBlocks, resolved.blocks.length);
  assert.equal(read.metadata.totalVolume, written.stats.volume);
  assert.equal(read.size.width, written.stats.width);
  assert.equal(read.size.height, written.stats.height);
  assert.equal(read.size.length, written.stats.length);
  assert.equal(read.palette.length, written.stats.paletteSize);
  assert.equal(read.palette[0]?.id, "minecraft:air");

  // A litematic stores positions relative to its region, so the comparison is
  // made after shifting by the origin the writer recorded.
  const origin = written.stats.origin;
  const expected = new Map(
    resolved.blocks.map((block) => [
      `${block.x - origin.x},${block.y - origin.y},${block.z - origin.z}`,
      keyOf(block),
    ]),
  );

  assert.equal(read.blocks.length, expected.size);
  for (const block of read.blocks) {
    const at = `${block.x},${block.y},${block.z}`;
    const want = expected.get(at);
    assert.ok(want, `read back a block at ${at} that was never written`);
    assert.equal(keyOf(block), want, `block at ${at} changed through the round trip`);
    expected.delete(at);
  }
  assert.equal(expected.size, 0, "some written blocks were not read back");

  // The build under test really does exercise states, not just full cubes.
  const forms = new Set(read.blocks.map((block) => block.id));
  assert.ok(Array.from(forms).some((id) => id.endsWith("_stairs")));
  assert.ok(Array.from(forms).some((id) => id.endsWith("_slab")));
  assert.ok(Array.from(forms).some((id) => id.endsWith("_door")));
  const stair = read.blocks.find((block) => block.id.endsWith("_stairs"));
  assert.ok(stair?.state?.facing && stair.state.half && stair.state.shape);
  const log = read.blocks.find((block) => block.state?.axis);
  assert.equal(log?.state?.axis, "y");
}

// A hand-computed case, so a matching pair of bugs in the writer and the
// reader cannot cancel out. Two blocks in a 2 by 1 by 2 box: the palette is
// air, dirt, stone (air first, then by descending use and then by name), and
// the index is y * (width * length) + z * width + x, so the entries are
// [stone, air, air, dirt] = [2, 0, 0, 1] at two bits each, packed least
// significant bit first: 2 | (1 << 6) = 66.
{
  const written = buildLitematic(
    [
      { x: 0, y: 0, z: 0, id: "minecraft:stone" },
      { x: 1, y: 0, z: 1, id: "minecraft:dirt" },
    ],
    { timeCreated: 1 },
  );
  const read = readLitematic(written.bytes);
  assert.deepEqual(
    read.palette.map((entry) => entry.id),
    ["minecraft:air", "minecraft:dirt", "minecraft:stone"],
  );
  assert.equal(written.stats.bitsPerEntry, 2);
  assert.deepEqual(packBlockStates([2, 0, 0, 1], 2), [66n]);
}

// Writing is deterministic given the same blocks and timestamps.
{
  const blocks: ResolvedBlock[] = [
    { x: 0, y: 0, z: 0, id: "minecraft:stone" },
    { x: 1, y: 0, z: 0, id: "minecraft:oak_stairs", state: { facing: "east", half: "bottom" } },
  ];
  const options = { name: "Stable", timeCreated: 1, timeModified: 1 };
  const a = buildLitematic(blocks, options);
  const b = buildLitematic(blocks, options);
  assert.deepEqual(Array.from(a.bytes), Array.from(b.bytes));
}

// A gap in the build stays air, and air is never written into the palette
// twice.
{
  const blocks: ResolvedBlock[] = [
    { x: 0, y: 0, z: 0, id: "minecraft:stone" },
    { x: 2, y: 0, z: 0, id: "minecraft:stone" },
  ];
  const written = buildLitematic(blocks, { timeCreated: 1 });
  const read = readLitematic(written.bytes);
  assert.equal(written.stats.volume, 3);
  assert.equal(read.blocks.length, 2);
  assert.equal(read.palette.length, 2);
  assert.deepEqual(
    read.blocks.map((block) => block.x),
    [0, 2],
  );
}

// An empty build is an error rather than a file nobody can load.
{
  let caught: unknown;
  try {
    buildLitematic([]);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.ok(caught.message.includes("No blocks"));
}

console.log("litematic round trip ok");
