import type { RoleName } from "@/lib/build/roles";

// Minecraft axis convention: north is -Z, south is +Z, east is +X, west is -X.
export type Facing = "north" | "south" | "east" | "west";
export type Axis = "x" | "y" | "z";
export type Half = "top" | "bottom";
export type StairShape =
  | "straight"
  | "inner_left"
  | "inner_right"
  | "outer_left"
  | "outer_right";

export type CellForm = "full" | "slab" | "stair";

export type BlockStateHints = {
  facing?: Facing;
  half?: Half;
  axis?: Axis;
  shape?: StairShape;
};

export type CellSource = {
  op: string;
  opIndex: number;
};

export type RoleCell = {
  role: RoleName;
  form: CellForm;
  state?: BlockStateHints;
  source: CellSource;
};

export type Vec3 = { x: number; y: number; z: number };

export type GridSizeXYZ = { w: number; h: number; d: number };

export type MirrorRecord = {
  axis: "x" | "z";
  // World-space coordinate the reflection is taken about, doubled so it stays
  // an integer for even-width masses (reflection of c is mirrorAt2 - c).
  mirrorAt2: number;
  opIndex: number;
};

export type OpeningRecord = {
  face: Facing;
  opIndex: number;
  cells: Vec3[];
};

// Cells are keyed by index into the grid box: y * (w * d) + z * w + x, with
// x, y, z relative to `origin`. Iteration order is ascending index so the grid
// serializes identically for identical inputs.
export type RoleGrid = {
  size: GridSizeXYZ;
  origin: Vec3;
  cells: Map<number, RoleCell>;
  mirrors: MirrorRecord[];
  openings: OpeningRecord[];
};

export function cellIndex(grid: RoleGrid, x: number, y: number, z: number): number {
  const lx = x - grid.origin.x;
  const ly = y - grid.origin.y;
  const lz = z - grid.origin.z;
  return ly * (grid.size.w * grid.size.d) + lz * grid.size.w + lx;
}

export function cellPosition(grid: RoleGrid, index: number): Vec3 {
  const layer = grid.size.w * grid.size.d;
  const ly = Math.floor(index / layer);
  const rest = index - ly * layer;
  const lz = Math.floor(rest / grid.size.w);
  const lx = rest - lz * grid.size.w;
  return {
    x: lx + grid.origin.x,
    y: ly + grid.origin.y,
    z: lz + grid.origin.z,
  };
}

export function getCell(grid: RoleGrid, x: number, y: number, z: number): RoleCell | undefined {
  if (
    x < grid.origin.x ||
    y < grid.origin.y ||
    z < grid.origin.z ||
    x >= grid.origin.x + grid.size.w ||
    y >= grid.origin.y + grid.size.h ||
    z >= grid.origin.z + grid.size.d
  ) {
    return undefined;
  }
  return grid.cells.get(cellIndex(grid, x, y, z));
}

export const FACING_VECTORS: Readonly<Record<Facing, { dx: number; dz: number }>> = {
  north: { dx: 0, dz: -1 },
  south: { dx: 0, dz: 1 },
  east: { dx: 1, dz: 0 },
  west: { dx: -1, dz: 0 },
};

export const OPPOSITE_FACING: Readonly<Record<Facing, Facing>> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

// Rotating a facing 90 degrees clockwise seen from above (north to east).
export const CLOCKWISE_FACING: Readonly<Record<Facing, Facing>> = {
  north: "east",
  east: "south",
  south: "west",
  west: "north",
};

export function mirrorFacing(facing: Facing, axis: "x" | "z"): Facing {
  if (axis === "x") {
    if (facing === "east") return "west";
    if (facing === "west") return "east";
    return facing;
  }
  if (facing === "north") return "south";
  if (facing === "south") return "north";
  return facing;
}

export function mirrorShape(shape: StairShape): StairShape {
  switch (shape) {
    case "inner_left":
      return "inner_right";
    case "inner_right":
      return "inner_left";
    case "outer_left":
      return "outer_right";
    case "outer_right":
      return "outer_left";
    default:
      return "straight";
  }
}

export function mirrorAxisHint(axis: Axis, mirror: "x" | "z"): Axis {
  // Axis hints describe an orientation, not a direction, so a reflection in a
  // perpendicular plane leaves them unchanged.
  void mirror;
  return axis;
}

export type { RoleName };
