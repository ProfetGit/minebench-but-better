import assert from "node:assert/strict";
import type { RoleGrid } from "../../../lib/build/types";
import { compile } from "../../../lib/compile/compile";
import { buildProgram, type BuildContext } from "../../../lib/dsl/api";
import { runRepairChecks } from "../../../lib/repair";
import type { Finding, FindingKind } from "../../../lib/repair";

function gridOf(callback: (ctx: BuildContext) => void): RoleGrid {
  return compile(buildProgram(callback));
}

function kinds(findings: readonly Finding[]): FindingKind[] {
  return findings.map((finding) => finding.kind);
}

// A closed shell with a floor and a roof reports nothing and has an interior.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 7, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.floor({ storey: 0, role: "floor" });
    m.walls({ role: "wall_primary" });
    m.flatRoof({ role: "roof_primary" });
  });

  const report = runRepairChecks(grid);
  assert.deepEqual(report.findings, []);
  // 5 by 5 of clear space, three levels high.
  assert.equal(report.interiorVolume, 75);
  assert.equal(report.blockCount, grid.cells.size);
}

// A window is an interior opening, so the shell stays sealed and the glass is
// not reported as a hole.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 7, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.floor({ storey: 0, role: "floor" });
    m.walls({ role: "wall_primary" });
    m.window({ face: "north", x: 0, y: 2, w: 1, h: 1, role: "glass" });
    m.flatRoof({ role: "roof_primary" });
  });
  assert.deepEqual(runRepairChecks(grid).findings, []);
}

// A doorway carved through the wall opens the shell. The interior is gone, and
// the declared opening is not blamed for it.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 7, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.floor({ storey: 0, role: "floor" });
    m.walls({ role: "wall_primary" });
    m.opening({ face: "north", x: 0, y: 1, w: 1, h: 2 });
    m.flatRoof({ role: "roof_primary" });
  });

  const report = runRepairChecks(grid);
  assert.deepEqual(kinds(report.findings), ["no_interior"]);
  assert.equal(report.interiorVolume, 0);
}

// A hole nobody declared is reported, with its coordinates.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 7, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.floor({ storey: 0, role: "floor" });
    m.walls({ role: "wall_primary" });
    m.flatRoof({ role: "roof_primary" });
    m.clear({ from: { x: 0, y: 2, z: -3 }, to: { x: 0, y: 2, z: -3 } });
  });

  const report = runRepairChecks(grid);
  assert.ok(kinds(report.findings).includes("wall_gap"));
  const gap = report.findings.find((finding) => finding.kind === "wall_gap");
  assert.deepEqual(gap?.coords, [{ x: 0, y: 2, z: -3 }]);
  assert.equal(gap?.count, 1);
  assert.ok(kinds(report.findings).includes("no_interior"));
}

// Blocks with nothing under them are reported rather than removed, because a
// detached lantern or an overhang can be exactly what was asked for.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 7, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.floor({ storey: 0, role: "floor" });
    m.post({ x: 0, z: 0, from: 3, to: 3, role: "light" });
  });

  const report = runRepairChecks(grid);
  const floating = report.findings.find((finding) => finding.kind === "floating_component");
  assert.ok(floating, "expected the detached block to be reported");
  assert.equal(floating.count, 1);
  assert.deepEqual(floating.coords, [{ x: 0, y: 3, z: 0 }]);
  // The grid is untouched: validation reports, it does not repair.
  assert.equal(runRepairChecks(grid).blockCount, grid.cells.size);
}

// Several detached pieces are reported separately.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.storeys({ count: 1, height: 6 });
    m.floor({ storey: 0, role: "floor" });
    m.post({ x: -3, z: -3, from: 3, to: 4, role: "light" });
    m.post({ x: 3, z: 3, from: 3, to: 3, role: "light" });
  });

  const report = runRepairChecks(grid);
  const floating = report.findings.filter((finding) => finding.kind === "floating_component");
  assert.equal(floating.length, 2);
  // Larger components are listed first.
  assert.equal(floating[0]?.count, 2);
  assert.equal(floating[1]?.count, 1);
}

// A mirror that nothing overwrites holds exactly.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.floor({ storey: 0, role: "floor" });
    m.walls({ role: "wall_primary" });
    m.mirrorX(() => {
      m.window({ face: "north", x: 2, y: 2, w: 1, h: 1, role: "glass" });
    });
    m.flatRoof({ role: "roof_primary" });
  });
  assert.deepEqual(
    runRepairChecks(grid).findings.filter((finding) => finding.kind === "broken_symmetry"),
    [],
  );
}

// A later op that overwrites one half only is reported, with the side that no
// longer matches.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 7 });
    m.storeys({ count: 1, height: 4 });
    m.floor({ storey: 0, role: "floor" });
    m.walls({ role: "wall_primary" });
    m.mirrorX(() => {
      m.window({ face: "north", x: 2, y: 2, w: 1, h: 1, role: "glass" });
    });
    m.fill({
      from: { x: -2, y: 2, z: -3 },
      to: { x: -2, y: 2, z: -3 },
      role: "wall_primary",
    });
    m.flatRoof({ role: "roof_primary" });
  });

  const report = runRepairChecks(grid);
  const broken = report.findings.find((finding) => finding.kind === "broken_symmetry");
  assert.ok(broken, "expected the overwritten half to be reported");
  assert.equal(broken.count, 1);
  assert.deepEqual(broken.coords, [{ x: 2, y: 2, z: -3 }]);
  assert.ok(broken.message.includes("mirrorX"));
}

// Findings are stable: the same grid reports the same thing every time.
{
  const grid = gridOf((ctx) => {
    const m = ctx.mass({ w: 9, d: 7 });
    m.storeys({ count: 2, height: 4 });
    m.floor({ storey: 0, role: "floor" });
    m.walls({ role: "wall_primary" });
    m.post({ x: 0, z: 0, from: 6, to: 7, role: "light" });
    m.gableRoof({ axis: "x", pitch: 1, role: "roof_primary", infillRole: "wall_primary" });
  });

  const first = JSON.stringify(runRepairChecks(grid));
  for (let run = 0; run < 5; run += 1) {
    assert.equal(JSON.stringify(runRepairChecks(grid)), first);
  }
}

console.log("repair ok");
