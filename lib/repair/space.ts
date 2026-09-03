import { cellPosition, type RoleGrid, type Vec3 } from "@/lib/build/types";

// Shared occupancy and flood fill used by the structural checks. Everything
// works on the role grid, before any palette is applied, so a finding is about
// the structure rather than about the blocks it happens to be made of.

export type Occupancy = {
  grid: RoleGrid;
  // Inclusive bounds of the flood space: the build box grown by one cell so
  // there is always an outside to fill from.
  min: Vec3;
  max: Vec3;
  solid: Set<number>;
};

export function occupancyOf(grid: RoleGrid): Occupancy {
  const solid = new Set<number>();
  for (const index of grid.cells.keys()) {
    const position = cellPosition(grid, index);
    solid.add(spaceKey(position.x, position.y, position.z));
  }
  return {
    grid,
    min: { x: grid.origin.x - 1, y: grid.origin.y - 1, z: grid.origin.z - 1 },
    max: {
      x: grid.origin.x + grid.size.w,
      y: grid.origin.y + grid.size.h,
      z: grid.origin.z + grid.size.d,
    },
    solid,
  };
}

const SPACE_OFFSET = 1024;
const SPACE_SPAN = 2048;

export function spaceKey(x: number, y: number, z: number): number {
  return ((x + SPACE_OFFSET) * SPACE_SPAN + (y + SPACE_OFFSET)) * SPACE_SPAN + (z + SPACE_OFFSET);
}

export function spacePosition(key: number): Vec3 {
  const z = (key % SPACE_SPAN) - SPACE_OFFSET;
  const rest = (key - (z + SPACE_OFFSET)) / SPACE_SPAN;
  const y = (rest % SPACE_SPAN) - SPACE_OFFSET;
  const x = (rest - (y + SPACE_OFFSET)) / SPACE_SPAN - SPACE_OFFSET;
  return { x, y, z };
}

export const NEIGHBOURS: readonly Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

export function inBounds(space: Occupancy, position: Vec3): boolean {
  return (
    position.x >= space.min.x &&
    position.y >= space.min.y &&
    position.z >= space.min.z &&
    position.x <= space.max.x &&
    position.y <= space.max.y &&
    position.z <= space.max.z
  );
}

export function isSolid(space: Occupancy, x: number, y: number, z: number): boolean {
  return space.solid.has(spaceKey(x, y, z));
}

// Six-connected flood fill over empty cells, starting outside the build. What
// it does not reach is either solid or sealed inside the build.
export function fillExterior(space: Occupancy): Set<number> {
  const start = { x: space.min.x, y: space.min.y, z: space.min.z };
  const visited = new Set<number>([spaceKey(start.x, start.y, start.z)]);
  const queue: Vec3[] = [start];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) break;
    for (const offset of NEIGHBOURS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y, z: current.z + offset.z };
      if (!inBounds(space, next)) continue;
      const key = spaceKey(next.x, next.y, next.z);
      if (visited.has(key) || space.solid.has(key)) continue;
      visited.add(key);
      queue.push(next);
    }
  }

  return visited;
}
