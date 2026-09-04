import type { Vec3 } from "@/lib/build/types";
import {
  NEIGHBOURS,
  spaceKey,
  spacePosition,
  type Occupancy,
} from "@/lib/repair/space";
import { cap, sortCoords, type Finding } from "@/lib/repair/types";

// Anything not connected to the lowest layer of the build has nothing holding
// it up. This is reported, never fixed: a floating lantern or an overhanging
// balcony may be exactly what was wanted, and the compiler has no way to know.
export function checkConnectivity(space: Occupancy): Finding[] {
  const remaining = new Set(space.solid);
  const groundY = space.grid.origin.y;
  const findings: Finding[] = [];

  while (remaining.size > 0) {
    const seedKey = firstOf(remaining);
    if (seedKey === null) break;
    const component: Vec3[] = [];
    const queue: Vec3[] = [spacePosition(seedKey)];
    remaining.delete(seedKey);
    let touchesGround = false;

    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) break;
      component.push(current);
      if (current.y === groundY) touchesGround = true;

      for (const offset of NEIGHBOURS) {
        const next = { x: current.x + offset.x, y: current.y + offset.y, z: current.z + offset.z };
        const key = spaceKey(next.x, next.y, next.z);
        if (!remaining.has(key)) continue;
        remaining.delete(key);
        queue.push(next);
      }
    }

    if (touchesGround) continue;

    const sorted = sortCoords(component);
    const capped = cap(sorted);
    const lowest = sorted[0];
    findings.push({
      kind: "floating_component",
      severity: "warning",
      message: `${component.length} block${component.length === 1 ? "" : "s"} are not connected to the rest of the build, starting at (${lowest?.x}, ${lowest?.y}, ${lowest?.z})`,
      coords: capped.coords,
      count: capped.count,
    });
  }

  return findings.sort((a, b) => b.count - a.count || a.message.localeCompare(b.message));
}

function firstOf(set: Set<number>): number | null {
  for (const value of set) return value;
  return null;
}
