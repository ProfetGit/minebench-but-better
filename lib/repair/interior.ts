import type { Vec3 } from "@/lib/build/types";
import { fillExterior, inBounds, spaceKey, type Occupancy } from "@/lib/repair/space";
import type { Finding } from "@/lib/repair/types";

export type InteriorResult = {
  cells: Vec3[];
  findings: Finding[];
};

// A build a player can live in has an enclosed, non-solid volume. This finds
// it by filling from outside the build and taking whatever empty space the
// fill could not reach.
export function checkInterior(space: Occupancy): InteriorResult {
  const exterior = fillExterior(space);
  const interior: Vec3[] = [];

  for (let y = space.min.y; y <= space.max.y; y += 1) {
    for (let z = space.min.z; z <= space.max.z; z += 1) {
      for (let x = space.min.x; x <= space.max.x; x += 1) {
        const position = { x, y, z };
        if (!inBounds(space, position)) continue;
        const key = spaceKey(x, y, z);
        if (space.solid.has(key) || exterior.has(key)) continue;
        interior.push(position);
      }
    }
  }

  if (interior.length > 0) {
    return { cells: interior, findings: [] };
  }

  return {
    cells: interior,
    findings: [
      {
        kind: "no_interior",
        severity: "warning",
        message:
          "The build has no enclosed interior: every empty cell inside it is reachable from outside",
        coords: [],
        count: 0,
      },
    ],
  };
}
