import type { Vec3 } from "@/lib/build/types";

export type FindingKind =
  | "floating_component"
  | "no_interior"
  | "wall_gap"
  | "broken_symmetry";

export type FindingSeverity = "warning" | "info";

export type Finding = {
  kind: FindingKind;
  severity: FindingSeverity;
  message: string;
  // A sample of the coordinates involved. Large findings are capped so the UI
  // can list them, and `count` says how many there really were.
  coords: Vec3[];
  count: number;
};

export const MAX_REPORTED_COORDS = 32;

export function cap(coords: Vec3[]): { coords: Vec3[]; count: number } {
  return { coords: coords.slice(0, MAX_REPORTED_COORDS), count: coords.length };
}

// Findings are ordered so the same build always reports in the same order.
export function sortCoords(coords: Vec3[]): Vec3[] {
  return coords
    .slice()
    .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}
