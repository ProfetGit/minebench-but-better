import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toRenderBuild } from "../../../lib/build/renderAdapter";
import { cellPosition, type RoleGrid } from "../../../lib/build/types";
import { compile } from "../../../lib/compile/compile";
import { buildProgram } from "../../../lib/dsl/api";
import { palettePreset } from "../../../lib/palette/presets";
import { resolve } from "../../../lib/palette/resolve";

function snapshot(grid: RoleGrid): string {
  return JSON.stringify({
    size: grid.size,
    origin: grid.origin,
    cells: Array.from(grid.cells.entries()).map(([index, cell]) => [
      cellPosition(grid, index),
      cell.role,
      cell.form,
      cell.state ?? null,
      cell.source,
    ]),
    mirrors: grid.mirrors,
    openings: grid.openings,
  });
}

const program = buildProgram((ctx) => {
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

// The hard requirement: swapping a palette re-renders without re-running the
// model or the compiler. One compile, two resolves.
const grid = compile(program);
const before = snapshot(grid);

const spruce = resolve(grid, palettePreset("spruce-survival"));
const stone = resolve(grid, palettePreset("stone-cottage"));

// The role grid is untouched by resolution, so it can be resolved again and
// again from the same artifact.
assert.equal(snapshot(grid), before);
assert.equal(spruce.grid, grid);
assert.equal(stone.grid, grid);

// Same geometry, different blocks.
assert.equal(spruce.blocks.length, stone.blocks.length);
for (let index = 0; index < spruce.blocks.length; index += 1) {
  const a = spruce.blocks[index];
  const b = stone.blocks[index];
  assert.ok(a && b);
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.equal(a.z, b.z);
}
assert.notEqual(
  spruce.blocks.map((block) => block.id).join(","),
  stone.blocks.map((block) => block.id).join(","),
);

// Both resolve into something the viewer can draw, at the same coordinates.
{
  const a = toRenderBuild(spruce.blocks);
  const b = toRenderBuild(stone.blocks);
  assert.equal(a.build.blocks.length, b.build.blocks.length);
  assert.equal(a.build.blocks.length, spruce.blocks.length);
  // Stairs and slabs are flattened for the preview only, and that is reported
  // rather than hidden. The render palette covers the catalogue, so nothing
  // should be falling back to a substitute block.
  for (const build of [a, b]) {
    assert.ok(build.substitutions.some((substitution) => substitution.reason === "form_flattened"));
    assert.deepEqual(
      build.substitutions.filter((substitution) => substitution.reason === "no_render_block"),
      [],
    );
  }
}

// Resolution is stable: the same grid and palette always give the same blocks.
{
  const again = resolve(grid, palettePreset("spruce-survival"));
  assert.equal(JSON.stringify(again.blocks), JSON.stringify(spruce.blocks));
  assert.equal(JSON.stringify(again.materials), JSON.stringify(spruce.materials));
}

// The palette layer must not be able to reach the DSL or the compiler, which is
// what keeps a swap from turning into a regeneration.
{
  const dir = join(process.cwd(), "lib", "palette");
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".ts")) continue;
    const source = readFileSync(join(dir, entry), "utf8");
    assert.ok(
      !source.includes("lib/dsl") && !source.includes("lib/compile"),
      `lib/palette/${entry} imports the DSL or the compiler`,
    );
  }
}

console.log("palette swap ok");
