import assert from "node:assert/strict";
import type { RoleGrid } from "../../../lib/build/types";
import { compile } from "../../../lib/compile/compile";
import { buildProgram, type BuildContext } from "../../../lib/dsl/api";
import { palettePreset } from "../../../lib/palette/presets";
import { resolve } from "../../../lib/palette/resolve";
import { parsePaletteOrThrow } from "../../../lib/palette/schema";
import type { ResolvedBlock } from "../../../lib/palette/types";

function gridOf(callback: (ctx: BuildContext) => void): RoleGrid {
  return compile(buildProgram(callback));
}

function blockAt(blocks: readonly ResolvedBlock[], x: number, y: number, z: number): ResolvedBlock {
  const found = blocks.find((block) => block.x === x && block.y === y && block.z === z);
  assert.ok(found, `expected a block at (${x}, ${y}, ${z})`);
  return found;
}

const house = gridOf((ctx) => {
  const m = ctx.mass({ w: 9, d: 7 });
  m.storeys({ count: 1, height: 4 });
  m.foundation({ role: "foundation", depth: 1 });
  m.floor({ storey: 0, role: "floor" });
  m.walls({ role: "wall_primary" });
  m.corners({ role: "structure_post" });
  m.window({ face: "north", x: 0, y: 2, w: 1, h: 1, role: "glass" });
  m.gableRoof({
    axis: "x",
    pitch: 1,
    overhang: 1,
    role: "roof_primary",
    trimRole: "roof_trim",
    infillRole: "wall_primary",
  });
  m.door({ face: "south", x: 0, role: "door" });
});

const spruce = palettePreset("spruce-survival");
const resolved = resolve(house, spruce);

// Roles become blocks only here.
assert.equal(blockAt(resolved.blocks, -4, 1, -3).id, "minecraft:stripped_spruce_log");
assert.equal(blockAt(resolved.blocks, 0, 1, -3).id, "minecraft:spruce_planks");
assert.equal(blockAt(resolved.blocks, 0, 0, 0).id, "minecraft:spruce_planks");
assert.equal(blockAt(resolved.blocks, 0, -1, 0).id, "minecraft:cobblestone");
assert.equal(blockAt(resolved.blocks, 0, 2, -3).id, "minecraft:glass");

// A palette state applies where the block has that property.
assert.deepEqual(blockAt(resolved.blocks, -4, 1, -3).state, { axis: "y" });
// And is dropped where it does not, rather than being written into the export.
assert.equal(blockAt(resolved.blocks, 0, 1, -3).state, undefined);

// The compiler decided the form, so the palette resolves the stair variant and
// carries the derived state through.
{
  const eave = blockAt(resolved.blocks, 0, 5, -3);
  assert.equal(eave.id, "minecraft:deepslate_tile_stairs");
  assert.deepEqual(eave.state, { facing: "south", half: "bottom", shape: "straight" });

  const ridge = blockAt(resolved.blocks, 0, 8, 0);
  assert.equal(ridge.id, "minecraft:deepslate_tiles");
  assert.equal(ridge.state, undefined);
}

// A ramp resolves per cell, deterministically, and only to its own members.
{
  const rampMembers = new Set([
    "minecraft:deepslate_tile_stairs",
    "minecraft:polished_deepslate_stairs",
    "minecraft:cobbled_deepslate_stairs",
    "minecraft:deepslate_tiles",
    "minecraft:polished_deepslate",
    "minecraft:cobbled_deepslate",
  ]);
  const trim = blockAt(resolved.blocks, 0, 4, -4);
  assert.ok(rampMembers.has(trim.id), `unexpected ramp block ${trim.id}`);

  const again = resolve(house, spruce);
  assert.equal(blockAt(again.blocks, 0, 4, -4).id, trim.id);
}

// A door is two cells, so the resolver derives the half from the cell below and
// the facing from the opening the compiler recorded.
{
  const lower = blockAt(resolved.blocks, 0, 1, 3);
  const upper = blockAt(resolved.blocks, 0, 2, 3);
  assert.equal(lower.id, "minecraft:spruce_door");
  assert.deepEqual(lower.state, { facing: "south", half: "lower" });
  assert.deepEqual(upper.state, { facing: "south", half: "upper" });
}

// The build is clean under a palette that maps everything it uses.
assert.deepEqual(resolved.warnings, []);
assert.equal(resolved.paletteName, "Spruce survival");

// An unmapped role is reported once, and its blocks are left out rather than
// being guessed at.
{
  const partial = parsePaletteOrThrow({
    name: "Partial",
    mcVersion: "1.21",
    roles: { wall_primary: { block: "minecraft:stone" } },
  });
  const report = resolve(house, partial);
  const unmapped = report.warnings.filter((warning) => warning.kind === "unmapped_role");
  assert.ok(unmapped.length > 0);
  assert.equal(unmapped.filter((warning) => warning.role === "floor").length, 1);
  assert.ok(report.blocks.every((block) => block.id === "minecraft:stone"));
}

// A block with no stair variant is reported and placed as a full block, never
// silently swapped for something else.
{
  const flat = parsePaletteOrThrow({
    name: "No variants",
    mcVersion: "1.21",
    roles: {
      wall_primary: { block: "minecraft:stone" },
      roof_primary: { block: "minecraft:deepslate" },
    },
  });
  const report = resolve(house, flat);
  const missing = report.warnings.filter((warning) => warning.kind === "missing_variant");
  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.block, "minecraft:deepslate");
  assert.equal(blockAt(report.blocks, 0, 5, -3).id, "minecraft:deepslate");
}

// A block outside the catalogue still exports, with a warning that it has no
// cost weight.
{
  const modded = parsePaletteOrThrow({
    name: "Modded",
    mcVersion: "1.21",
    roles: { wall_primary: { block: "create:andesite_casing" } },
  });
  const report = resolve(house, modded);
  const unknown = report.warnings.filter((warning) => warning.kind === "unknown_block");
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0]?.block, "create:andesite_casing");
  assert.ok(report.blocks.some((block) => block.id === "create:andesite_casing"));
}

// A bare block id is read as vanilla rather than rejected.
{
  const bare = parsePaletteOrThrow({
    name: "Bare ids",
    mcVersion: "1.21",
    roles: { wall_primary: { block: "stone" } },
  });
  const report = resolve(house, bare);
  assert.ok(report.blocks.every((block) => block.id === "minecraft:stone"));
  assert.deepEqual(
    report.warnings.filter((warning) => warning.kind === "unknown_block"),
    [],
  );
}

console.log("palette resolve ok");
