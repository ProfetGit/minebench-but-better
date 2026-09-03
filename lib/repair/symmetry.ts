import {
  cellPosition,
  getCell,
  mirrorFacing,
  mirrorShape,
  type MirrorRecord,
  type RoleCell,
  type RoleGrid,
  type Vec3,
} from "@/lib/build/types";
import { cap, sortCoords, type Finding } from "@/lib/repair/types";

// Mirrored halves come out of the compiler, so they start exact. They can still
// be broken afterwards by a later op writing over one side, which is legal and
// sometimes deliberate. The assertion covers only the cells the mirror produced
// and reports where the symmetry stopped holding.
export function checkSymmetry(grid: RoleGrid): Finding[] {
  const findings: Finding[] = [];

  for (const mirror of grid.mirrors) {
    const owned = new Set(mirror.bodyOps);
    const broken: Vec3[] = [];

    for (const [index, cell] of grid.cells) {
      if (!owned.has(cell.source.opIndex)) continue;
      const position = cellPosition(grid, index);
      const reflected = reflect(position, mirror);
      const other = getCell(grid, reflected.x, reflected.y, reflected.z);
      if (!other || !matches(cell, other, mirror.axis)) broken.push(position);
    }

    if (broken.length === 0) continue;

    const sorted = sortCoords(broken);
    const capped = cap(sorted);
    const first = sorted[0];
    findings.push({
      kind: "broken_symmetry",
      severity: "warning",
      message: `mirror${mirror.axis.toUpperCase()} (op #${mirror.opIndex}) produced ${broken.length} cell${broken.length === 1 ? "" : "s"} that a later op overwrote on one side only, starting at (${first?.x}, ${first?.y}, ${first?.z})`,
      coords: capped.coords,
      count: capped.count,
    });
  }

  return findings;
}

function reflect(position: Vec3, mirror: MirrorRecord): Vec3 {
  if (mirror.axis === "x") {
    return { x: mirror.mirrorAt2 - position.x, y: position.y, z: position.z };
  }
  return { x: position.x, y: position.y, z: mirror.mirrorAt2 - position.z };
}

function matches(cell: RoleCell, other: RoleCell, axis: "x" | "z"): boolean {
  if (cell.role !== other.role || cell.form !== other.form) return false;

  const expectedFacing = cell.state?.facing ? mirrorFacing(cell.state.facing, axis) : undefined;
  const expectedShape = cell.state?.shape ? mirrorShape(cell.state.shape) : undefined;

  return (
    (other.state?.facing ?? undefined) === expectedFacing &&
    (other.state?.shape ?? undefined) === expectedShape &&
    (other.state?.half ?? undefined) === (cell.state?.half ?? undefined) &&
    (other.state?.axis ?? undefined) === (cell.state?.axis ?? undefined)
  );
}
