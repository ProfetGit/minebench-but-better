import assert from "node:assert/strict";
import type { RoleCell, RoleGrid } from "../../../lib/build/types";
import { cellPosition, getCell } from "../../../lib/build/types";
import { compile } from "../../../lib/compile/compile";
import { buildProgram, type BuildContext } from "../../../lib/dsl/api";
import { DslError } from "../../../lib/dsl/errors";

function gridOf(callback: (ctx: BuildContext) => void): RoleGrid {
  return compile(buildProgram(callback));
}

function serialize(grid: RoleGrid): string {
  const cells = Array.from(grid.cells.entries()).map(([index, cell]) => [
    index,
    cellPosition(grid, index),
    cell.role,
    cell.form,
    cell.state ?? null,
  ]);
  return JSON.stringify({ size: grid.size, origin: grid.origin, cells, mirrors: grid.mirrors });
}

function occupied(grid: RoleGrid, x: number, y: number, z: number): RoleCell {
  const cell = getCell(grid, x, y, z);
  assert.ok(cell, `expected a cell at (${x}, ${y}, ${z})`);
  return cell;
}

// Walls fill the perimeter of the wall band, and nothing else.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 5, d: 5 });
    m.storeys({ count: 1, height: 4 });
    m.walls({ role: "wall_primary" });
  });

  // 5 by 5 perimeter is 16 cells, over a wall band of y 1..3.
  assert.equal(grid.cells.size, 48);
  assert.equal(occupied(grid, -2, 1, -2).role, "wall_primary");
  assert.equal(getCell(grid, 0, 1, 0), undefined);
  assert.equal(getCell(grid, -2, 0, -2), undefined);
  assert.equal(getCell(grid, -2, 4, -2), undefined);
}

// Storey geometry: floors sit on the storey base, walls sit above it.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 5, d: 5 });
    m.storeys({ count: 2, height: 4 });
    m.walls({ role: "wall_primary" });
    m.floor({ storey: 0, role: "floor" });
    m.floor({ storey: 1, role: "floor" });
  });

  assert.equal(occupied(grid, 0, 0, 0).role, "floor");
  assert.equal(occupied(grid, 0, 4, 0).role, "floor");
  assert.equal(occupied(grid, -2, 7, -2).role, "wall_primary");
  assert.equal(getCell(grid, -2, 8, -2), undefined);
}

// The compiler is deterministic: the same program compiles to the same grid.
{
  const program = buildProgram((ctx) => {
    const m = ctx.mass({ w: 13, d: 9 });
    m.storeys({ count: 2, height: 4 });
    m.walls({ role: "wall_primary" });
    m.corners({ role: "structure_post" });
    m.floor({ storey: 0, role: "floor" });
    m.mirrorX(() => {
      m.opening({ face: "north", x: 2, y: 2, w: 1, h: 2, role: "glass" });
    });
    m.gableRoof({ axis: "x", pitch: 1, overhang: 1, role: "roof_primary", trimRole: "roof_trim" });
    m.door({ face: "south", x: 0, role: "door" });
  });

  const first = serialize(compile(program));
  for (let run = 0; run < 50; run += 1) {
    assert.equal(serialize(compile(program)), first);
  }
}

// Ops that do not touch the same coordinates are order independent.
{
  const a = gridOf((ctx) => {
    const m = ctx.mass({ w: 7, d: 7 });
    m.walls({ role: "wall_primary" });
    m.floor({ storey: 0, role: "floor" });
  });
  const b = gridOf((ctx) => {
    const m = ctx.mass({ w: 7, d: 7 });
    m.floor({ storey: 0, role: "floor" });
    m.walls({ role: "wall_primary" });
  });
  assert.equal(
    serialize(a).replace(/"opIndex":\d+/g, ""),
    serialize(b).replace(/"opIndex":\d+/g, ""),
  );
}

// Where they do overlap, the later op wins.
{
  const cornersLast = gridOf((ctx) => {
    const m = ctx.mass({ w: 7, d: 7 });
    m.walls({ role: "wall_primary" });
    m.corners({ role: "structure_post" });
  });
  assert.equal(occupied(cornersLast, -3, 1, -3).role, "structure_post");

  const wallsLast = gridOf((ctx) => {
    const m = ctx.mass({ w: 7, d: 7 });
    m.corners({ role: "structure_post" });
    m.walls({ role: "wall_primary" });
  });
  assert.equal(occupied(wallsLast, -3, 1, -3).role, "wall_primary");
}

// mirrorX reflects across the mass centre line, for odd and for even widths,
// and the program only writes one half.
{
  const odd = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.mirrorX(() => {
      m.post({ x: 3, z: 0, from: 1, to: 1, role: "structure_post" });
    });
  });
  assert.equal(odd.cells.size, 2);
  assert.equal(occupied(odd, 3, 1, 0).role, "structure_post");
  assert.equal(occupied(odd, -3, 1, 0).role, "structure_post");
  assert.deepEqual(odd.mirrors, [{ axis: "x", mirrorAt2: 0, opIndex: 0, bodyOps: [1] }]);

  const even = gridOf((ctx) => {
    const m = ctx.mass({ w: 8, d: 8 });
    m.mirrorX(() => {
      m.post({ x: 3, z: 0, from: 1, to: 1, role: "structure_post" });
    });
  });
  // w = 8 spans x -4..3, so the centre line is at -0.5 and 3 reflects to -4.
  assert.equal(even.cells.size, 2);
  assert.equal(occupied(even, -4, 1, 0).role, "structure_post");
}

// A cell on the axis of symmetry reflects onto itself exactly once.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.mirrorX(() => {
      m.post({ x: 0, z: 0, from: 1, to: 2, role: "structure_post" });
    });
  });
  assert.equal(grid.cells.size, 2);
}

// Mirroring reflects derived block states as well as positions.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.mirrorX(() => {
      m.stairsRun({
        from: { x: 1, y: 1, z: 0 },
        to: { x: 3, y: 3, z: 0 },
        role: "floor",
      });
    });
  });
  assert.equal(occupied(grid, 1, 1, 0).state?.facing, "east");
  assert.equal(occupied(grid, -1, 1, 0).state?.facing, "west");
}

// repeat places copies of one recorded body.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 15, d: 9 });
    m.repeat({ count: 4, step: { x: 2, y: 0, z: 0 } }, () => {
      m.post({ x: -6, z: 0, from: 1, to: 1, role: "structure_post" });
    });
  });
  assert.equal(grid.cells.size, 4);
  for (const x of [-6, -4, -2, 0]) {
    assert.equal(occupied(grid, x, 1, 0).role, "structure_post");
  }
}

// translate moves a recorded body without duplicating it.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.translate({ x: 0, y: 2, z: 0 }, () => {
      m.post({ x: 0, z: 0, from: 1, to: 1, role: "structure_post" });
    });
  });
  assert.equal(grid.cells.size, 1);
  assert.equal(occupied(grid, 0, 3, 0).role, "structure_post");
}

// An opening without a role carves the wall; with a role it fills the hole.
{
  const carved = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.storeys({ count: 1, height: 4 });
    m.walls({ role: "wall_primary" });
    m.opening({ face: "north", x: 0, y: 1, w: 1, h: 2 });
  });
  assert.equal(getCell(carved, 0, 1, -4), undefined);
  assert.equal(getCell(carved, 0, 2, -4), undefined);
  assert.equal(carved.openings.length, 1);
  assert.equal(carved.openings[0]?.face, "north");
  assert.equal(carved.openings[0]?.cells.length, 2);

  const glazed = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.storeys({ count: 1, height: 4 });
    m.walls({ role: "wall_primary" });
    m.window({ face: "north", x: 0, y: 1, w: 1, h: 2, role: "glass" });
  });
  assert.equal(occupied(glazed, 0, 1, -4).role, "glass");
}

// A carve survives a mirror, so a mirrored opening still cuts its hole.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.storeys({ count: 1, height: 4 });
    m.walls({ role: "wall_primary" });
    m.mirrorX(() => {
      m.opening({ face: "north", x: 2, y: 1, w: 1, h: 2 });
    });
  });
  assert.equal(getCell(grid, 2, 1, -4), undefined);
  assert.equal(getCell(grid, -2, 1, -4), undefined);
  assert.equal(grid.openings.length, 2);
}

// mirrorZ flips the face an opening was cut in.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.storeys({ count: 1, height: 4 });
    m.walls({ role: "wall_primary" });
    m.mirrorZ(() => {
      m.window({ face: "north", x: 0, y: 1, w: 1, h: 2, role: "glass" });
    });
  });
  assert.equal(occupied(grid, 0, 1, -4).role, "glass");
  assert.equal(occupied(grid, 0, 1, 4).role, "glass");
  assert.deepEqual(
    grid.openings.map((opening) => opening.face).sort(),
    ["north", "south"],
  );
}

// An opening that leaves its face fails with the coordinates it tried to use.
{
  let caught: unknown;
  try {
    gridOf((ctx) => {
      const m = ctx.mass({ w: 9, d: 9 });
      m.storeys({ count: 1, height: 4 });
      m.walls({ role: "wall_primary" });
      m.opening({ face: "north", x: 6, y: 1, w: 2, h: 2, role: "glass" });
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DslError);
  assert.equal(caught.op, "opening");
  assert.ok(caught.message.includes("leaves the north face"));
}

// An opening above the wall band fails too.
{
  let caught: unknown;
  try {
    gridOf((ctx) => {
      const m = ctx.mass({ w: 9, d: 9 });
      m.storeys({ count: 1, height: 4 });
      m.walls({ role: "wall_primary" });
      m.opening({ face: "north", x: 0, y: 3, w: 1, h: 4, role: "glass" });
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DslError);
  assert.ok(caught.message.includes("leaves the wall band"));
}

// clear removes cells an earlier op placed.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 5, d: 5 });
    m.storeys({ count: 1, height: 4 });
    m.floor({ storey: 0, role: "floor" });
    m.clear({ from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } });
  });
  assert.equal(grid.cells.size, 24);
  assert.equal(getCell(grid, 0, 0, 0), undefined);
}

// Grid indices round trip through the documented layout.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 5, d: 5 });
    m.storeys({ count: 1, height: 4 });
    m.floor({ storey: 0, role: "floor" });
    m.walls({ role: "wall_primary" });
  });
  for (const [index] of grid.cells) {
    const position = cellPosition(grid, index);
    assert.ok(getCell(grid, position.x, position.y, position.z));
  }
  // Cells are stored in ascending index order so the grid serializes stably.
  const indices = Array.from(grid.cells.keys());
  const sorted = indices.slice().sort((a, b) => a - b);
  assert.deepEqual(indices, sorted);
}

console.log("compile ok");
