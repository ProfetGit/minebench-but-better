import {
  CLOCKWISE_FACING,
  FACING_VECTORS,
  OPPOSITE_FACING,
  type Facing,
  type RoleCell,
  type StairShape,
} from "@/lib/build/types";
import { packKey, unpackKey, type CellWrite, type Scratch } from "@/lib/compile/grid";

// Verified against the vanilla model data (assets/minecraft/models/block/stairs.json
// with blockstates/oak_stairs.json): the unrotated model is facing=east and its
// upper step occupies x 8..16, the east half. So `facing` points at the tall
// side of the stair, and a roof surface that descends toward the north carries
// facing=south.
export function stairFacingForDownhill(downhill: Facing): Facing {
  return OPPOSITE_FACING[downhill];
}

export function counterClockwiseFacing(facing: Facing): Facing {
  return OPPOSITE_FACING[CLOCKWISE_FACING[facing]];
}

export function isPerpendicular(a: Facing, b: Facing): boolean {
  return a !== b && b !== OPPOSITE_FACING[a];
}

function stairAt(cells: Map<number, CellWrite>, x: number, y: number, z: number): RoleCell | null {
  const cell = cells.get(packKey(x, y, z));
  if (!cell || cell.form !== "stair") return null;
  return cell;
}

function facingOf(cell: RoleCell): Facing | null {
  return cell.state?.facing ?? null;
}

function sameHalf(a: RoleCell, b: RoleCell): boolean {
  return (a.state?.half ?? "bottom") === (b.state?.half ?? "bottom");
}

// An approximation of the vanilla corner rule: a stair turns into an outer
// corner when the stair it faces runs perpendicular to it, and into an inner
// corner when the stair behind it does. Vanilla additionally cancels the corner
// when the opposite neighbour already continues the same run, which is the
// guard applied here.
export function deriveStairShapes(scratch: Scratch): void {
  const updates: Array<{ key: number; cell: RoleCell }> = [];

  for (const [key, cell] of scratch.cells) {
    if (!cell || cell.form !== "stair") continue;
    const facing = facingOf(cell);
    if (!facing) continue;
    const position = unpackKey(key);
    const forward = FACING_VECTORS[facing];
    const back = FACING_VECTORS[OPPOSITE_FACING[facing]];

    const front = stairAt(scratch.cells, position.x + forward.dx, position.y, position.z + forward.dz);
    const behind = stairAt(scratch.cells, position.x + back.dx, position.y, position.z + back.dz);

    let shape: StairShape = "straight";

    const frontFacing = front && sameHalf(front, cell) ? facingOf(front) : null;
    const behindFacing = behind && sameHalf(behind, cell) ? facingOf(behind) : null;

    if (frontFacing && isPerpendicular(facing, frontFacing) && behindFacing !== frontFacing) {
      shape = frontFacing === counterClockwiseFacing(facing) ? "outer_left" : "outer_right";
    } else if (behindFacing && isPerpendicular(facing, behindFacing) && frontFacing !== behindFacing) {
      shape = behindFacing === counterClockwiseFacing(facing) ? "inner_left" : "inner_right";
    }

    const current = cell.state?.shape ?? "straight";
    if (current !== shape) {
      updates.push({ key, cell: { ...cell, state: { ...cell.state, shape } } });
    }
  }

  for (const update of updates) {
    scratch.cells.set(update.key, update.cell);
  }
}
