import { getBlock, normalizeBlockId } from "@/lib/palette/blocks";

// A ramp is one palette slot but several blocks. Members are ordered by Oklab
// lightness, darkest first, so a ramp reads as a shade sequence rather than as
// whatever order it happened to be typed in. A block missing from the catalogue
// has no colour, so it sorts last and keeps a stable position by id.
export function orderRamp(members: readonly string[]): string[] {
  return members
    .map((member) => normalizeBlockId(member))
    .map((id) => ({ id, lightness: getBlock(id)?.color.lightness ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.lightness - b.lightness || a.id.localeCompare(b.id))
    .map((entry) => entry.id);
}

// Selection is a hash of the coordinate, not a counter, so the same cell always
// draws the same shade no matter what order the grid is walked in and no matter
// which other cells resolved before it.
export function rampIndexFor(x: number, y: number, z: number, length: number): number {
  if (length <= 1) return 0;
  let hash = (x * 0x1f1f1f1f) ^ (y * 0x2545f491) ^ (z * 0x9e3779b1);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) % length;
}
