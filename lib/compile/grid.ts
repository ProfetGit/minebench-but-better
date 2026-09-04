import {
  mirrorFacing,
  mirrorShape,
  type Facing,
  type RoleCell,
  type Vec3,
} from "@/lib/build/types";

// Scratch coordinates are author-space (the mass is centred on the origin), so
// they can be negative. Keys pack a bounded cube around the origin into a
// single safe integer.
const KEY_OFFSET = 1024;
const KEY_SPAN = 2048;

export function packKey(x: number, y: number, z: number): number {
  return ((x + KEY_OFFSET) * KEY_SPAN + (y + KEY_OFFSET)) * KEY_SPAN + (z + KEY_OFFSET);
}

export function unpackKey(key: number): Vec3 {
  const z = (key % KEY_SPAN) - KEY_OFFSET;
  const rest = (key - (z + KEY_OFFSET)) / KEY_SPAN;
  const y = (rest % KEY_SPAN) - KEY_OFFSET;
  const x = (rest - (y + KEY_OFFSET)) / KEY_SPAN - KEY_OFFSET;
  return { x, y, z };
}

export function isInKeyRange(x: number, y: number, z: number): boolean {
  return (
    x >= -KEY_OFFSET &&
    y >= -KEY_OFFSET &&
    z >= -KEY_OFFSET &&
    x < KEY_OFFSET &&
    y < KEY_OFFSET &&
    z < KEY_OFFSET
  );
}

export type OpeningDraft = {
  face: Facing;
  opIndex: number;
  cells: Vec3[];
};

// A write of `null` is an explicit carve: it removes whatever an earlier op put
// at that coordinate, and it survives transforms and scratch merges so a mirror
// of an opening still cuts its hole.
export type CellWrite = RoleCell | null;

export type Scratch = {
  cells: Map<number, CellWrite>;
  openings: OpeningDraft[];
};

export function createScratch(): Scratch {
  return { cells: new Map<number, CellWrite>(), openings: [] };
}

export function writeCell(scratch: Scratch, x: number, y: number, z: number, cell: RoleCell): void {
  scratch.cells.set(packKey(x, y, z), cell);
}

export function carveCell(scratch: Scratch, x: number, y: number, z: number): void {
  scratch.cells.set(packKey(x, y, z), null);
}

// Merging keeps insertion order of the source, and a later write always wins,
// which is the documented "last op at a coordinate wins" rule.
export function mergeScratch(target: Scratch, source: Scratch): void {
  for (const [key, value] of source.cells) {
    target.cells.set(key, value);
  }
  for (const opening of source.openings) {
    target.openings.push(opening);
  }
}

export function transformScratch(
  source: Scratch,
  transform: (position: Vec3) => Vec3,
  transformCell: (cell: RoleCell) => RoleCell,
): Scratch {
  const out = createScratch();
  for (const [key, value] of source.cells) {
    const moved = transform(unpackKey(key));
    out.cells.set(packKey(moved.x, moved.y, moved.z), value === null ? null : transformCell(value));
  }
  for (const opening of source.openings) {
    out.openings.push({
      face: opening.face,
      opIndex: opening.opIndex,
      cells: opening.cells.map((cell) => transform(cell)),
    });
  }
  return out;
}

export function mirrorCellState(cell: RoleCell, axis: "x" | "z"): RoleCell {
  if (!cell.state) return cell;
  const state = { ...cell.state };
  if (state.facing) state.facing = mirrorFacing(state.facing, axis);
  if (state.shape) state.shape = mirrorShape(state.shape);
  return { ...cell, state };
}

export function mirrorOpeningFace(face: Facing, axis: "x" | "z"): Facing {
  return mirrorFacing(face, axis);
}
