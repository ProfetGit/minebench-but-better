import type { Vec3 } from "@/lib/build/types";
import { fillExterior, NEIGHBOURS, spaceKey, type Occupancy } from "@/lib/repair/space";
import { cap, sortCoords, type Finding } from "@/lib/repair/types";

// How many solid neighbours an empty cell needs before it reads as a hole in a
// surface rather than as open air beside the build.
const ENCLOSED_NEIGHBOUR_THRESHOLD = 4;

// A gap is an empty cell that sits in a wall or a roof, is reachable from
// outside, and was not one of the openings the program asked for. Declared
// openings are excluded by coordinate, so a window is never reported as a hole.
export function checkClosure(space: Occupancy): Finding[] {
  const exterior = fillExterior(space);
  const declared = new Set<number>();
  for (const opening of space.grid.openings) {
    for (const cell of opening.cells) declared.add(spaceKey(cell.x, cell.y, cell.z));
  }

  const gaps: Vec3[] = [];
  const grid = space.grid;

  for (let y = grid.origin.y; y < grid.origin.y + grid.size.h; y += 1) {
    for (let z = grid.origin.z; z < grid.origin.z + grid.size.d; z += 1) {
      for (let x = grid.origin.x; x < grid.origin.x + grid.size.w; x += 1) {
        const key = spaceKey(x, y, z);
        if (space.solid.has(key) || declared.has(key)) continue;
        if (!exterior.has(key)) continue;

        let solidNeighbours = 0;
        for (const offset of NEIGHBOURS) {
          if (space.solid.has(spaceKey(x + offset.x, y + offset.y, z + offset.z))) {
            solidNeighbours += 1;
          }
        }
        if (solidNeighbours >= ENCLOSED_NEIGHBOUR_THRESHOLD) gaps.push({ x, y, z });
      }
    }
  }

  if (gaps.length === 0) return [];

  const sorted = sortCoords(gaps);
  const capped = cap(sorted);
  const first = sorted[0];
  return [
    {
      kind: "wall_gap",
      severity: "warning",
      message: `${gaps.length} cell${gaps.length === 1 ? " sits" : "s sit"} in a surface but ${gaps.length === 1 ? "was" : "were"} not declared as an opening, starting at (${first?.x}, ${first?.y}, ${first?.z})`,
      coords: capped.coords,
      count: capped.count,
    },
  ];
}
