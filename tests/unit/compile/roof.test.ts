import assert from "node:assert/strict";
import type { RoleCell, RoleGrid } from "../../../lib/build/types";
import { getCell } from "../../../lib/build/types";
import { compile } from "../../../lib/compile/compile";
import { stairFacingForDownhill } from "../../../lib/compile/geometry";
import { buildProgram, type BuildContext } from "../../../lib/dsl/api";

function gridOf(callback: (ctx: BuildContext) => void): RoleGrid {
  return compile(buildProgram(callback));
}

function occupied(grid: RoleGrid, x: number, y: number, z: number): RoleCell {
  const cell = getCell(grid, x, y, z);
  assert.ok(cell, `expected a cell at (${x}, ${y}, ${z})`);
  return cell;
}

// Verified against the vanilla stair model: facing points at the tall side, so
// a surface descending north carries facing south.
assert.equal(stairFacingForDownhill("north"), "south");
assert.equal(stairFacingForDownhill("east"), "west");

// A gable roof slopes away from a ridge, in stairs, with the ridge in full
// blocks. The program never states a facing.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.walls({ role: "wall_primary" });
    m.gableRoof({ axis: "x", pitch: 1, role: "roof_primary" });
  });

  // Walls top out at y 3, so the roof base is y 4.
  const eaveNorth = occupied(grid, 0, 4, -3);
  assert.equal(eaveNorth.form, "stair");
  assert.equal(eaveNorth.state?.facing, "south");
  assert.equal(eaveNorth.state?.half, "bottom");
  assert.equal(eaveNorth.state?.shape, "straight");

  const eaveSouth = occupied(grid, 0, 4, 3);
  assert.equal(eaveSouth.state?.facing, "north");

  const ridge = occupied(grid, 0, 7, 0);
  assert.equal(ridge.form, "full");
  assert.equal(ridge.role, "roof_primary");

  // The slope climbs one block per row at pitch 1.
  assert.equal(occupied(grid, 0, 5, -2).form, "stair");
  assert.equal(occupied(grid, 0, 6, -1).form, "stair");
}

// Pitch multiplies the rise per row.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.gableRoof({ axis: "x", pitch: 2, role: "roof_primary" });
  });
  assert.equal(occupied(grid, 0, 4, -3).form, "stair");
  assert.equal(occupied(grid, 0, 6, -2).form, "stair");
  assert.equal(occupied(grid, 0, 10, 0).form, "full");
}

// A z-axis ridge slopes east and west instead.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 7, d: 9 });
    m.storeys({ count: 1, height: 4 });
    m.gableRoof({ axis: "z", pitch: 1, role: "roof_primary" });
  });
  assert.equal(occupied(grid, -3, 4, 0).state?.facing, "east");
  assert.equal(occupied(grid, 3, 4, 0).state?.facing, "west");
  assert.equal(occupied(grid, 0, 7, 0).form, "full");
}

// The overhang extends past the walls and takes the trim role when one is given.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.gableRoof({
      axis: "x",
      pitch: 1,
      overhang: 1,
      role: "roof_primary",
      trimRole: "roof_trim",
    });
  });
  assert.equal(occupied(grid, 0, 4, -4).role, "roof_trim");
  assert.equal(occupied(grid, -5, 4, -4).role, "roof_trim");
  assert.equal(occupied(grid, 0, 8, 0).role, "roof_primary");
}

// The gable ends are only filled when an infill role is given.
{
  const open = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.gableRoof({ axis: "x", pitch: 1, role: "roof_primary" });
  });
  assert.equal(getCell(open, -4, 5, 0), undefined);

  const filled = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.gableRoof({ axis: "x", pitch: 1, role: "roof_primary", infillRole: "wall_primary" });
  });
  assert.equal(occupied(filled, -4, 5, 0).role, "wall_primary");
  assert.equal(occupied(filled, -4, 6, 0).role, "wall_primary");
  // The infill stops below the roof surface, which is at y 7 on the ridge row.
  assert.equal(occupied(filled, -4, 7, 0).form, "full");
  assert.equal(getCell(filled, -4, 8, 0), undefined);
}

// A hip roof slopes toward all four sides and derives corner shapes.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.storeys({ count: 1, height: 4 });
    m.hipRoof({ pitch: 1, role: "roof_primary" });
  });

  assert.equal(occupied(grid, 0, 4, -4).state?.facing, "south");
  assert.equal(occupied(grid, 0, 4, 4).state?.facing, "north");
  assert.equal(occupied(grid, -4, 4, 0).state?.facing, "east");
  assert.equal(occupied(grid, 4, 4, 0).state?.facing, "west");

  const peak = occupied(grid, 0, 8, 0);
  assert.equal(peak.form, "full");

  const corner = occupied(grid, -4, 4, -4);
  assert.equal(corner.form, "stair");
  assert.ok(
    corner.state?.shape === "outer_left" || corner.state?.shape === "outer_right",
    `expected an outer corner at the hip, received ${String(corner.state?.shape)}`,
  );
}

// A flat roof is one layer at the roof base.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 5, d: 5 });
    m.storeys({ count: 1, height: 4 });
    m.flatRoof({ role: "roof_primary" });
  });
  assert.equal(grid.cells.size, 25);
  assert.equal(occupied(grid, 0, 4, 0).form, "full");
}

// A staircase run derives its facing from the direction of climb.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.storeys({ count: 1, height: 6 });
    m.stairsRun({ from: { x: -2, y: 1, z: 2 }, to: { x: 1, y: 4, z: 2 }, role: "floor" });
  });
  assert.equal(occupied(grid, -2, 1, 2).state?.facing, "east");
  assert.equal(occupied(grid, 1, 4, 2).state?.facing, "east");
  assert.equal(occupied(grid, 0, 3, 2).form, "stair");
}

console.log("roof ok");
