import type { RoleGrid } from "@/lib/build/types";
import { checkClosure } from "@/lib/repair/closure";
import { checkConnectivity } from "@/lib/repair/connectivity";
import { checkInterior } from "@/lib/repair/interior";
import { occupancyOf } from "@/lib/repair/space";
import { checkSymmetry } from "@/lib/repair/symmetry";
import type { Finding } from "@/lib/repair/types";

export type RepairReport = {
  findings: Finding[];
  // Cells of enclosed, non-solid space. Zero means the shell is open.
  interiorVolume: number;
  blockCount: number;
};

// Validation only. Nothing here edits the grid: a finding is surfaced for a
// person to act on, because every one of these can be intentional.
export function runRepairChecks(grid: RoleGrid): RepairReport {
  const space = occupancyOf(grid);
  const interior = checkInterior(space);

  const findings: Finding[] = [
    ...checkConnectivity(space),
    ...interior.findings,
    ...checkClosure(space),
    ...checkSymmetry(grid),
  ];

  return {
    findings,
    interiorVolume: interior.cells.length,
    blockCount: grid.cells.size,
  };
}

export type { Finding, FindingKind, FindingSeverity } from "@/lib/repair/types";
