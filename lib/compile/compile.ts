import type { RoleName } from "@/lib/build/roles";
import {
  type BlockStateHints,
  type CellForm,
  type Facing,
  type MirrorRecord,
  type OpeningRecord,
  type RoleCell,
  type RoleGrid,
  type Vec3,
} from "@/lib/build/types";
import { deriveStairShapes, stairFacingForDownhill } from "@/lib/compile/geometry";
import {
  carveCell,
  createScratch,
  isInKeyRange,
  mergeScratch,
  mirrorCellState,
  mirrorOpeningFace,
  packKey,
  transformScratch,
  unpackKey,
  writeCell,
  type Scratch,
} from "@/lib/compile/grid";
import { DslError } from "@/lib/dsl/errors";
import type { LeafOp, OpNode, OpSpecMap, Program } from "@/lib/dsl/program";

export type MassInfo = {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  storeyCount: number;
  storeyHeight: number;
  // Highest wall block. The roof starts one block above it.
  wallTopY: number;
  roofBaseY: number;
  mirrorAt2X: number;
  mirrorAt2Z: number;
};

export function massInfo(program: Program): MassInfo {
  const { w, d } = program.mass;
  const { count, height } = program.storeys;
  const xMin = -Math.floor(w / 2);
  const zMin = -Math.floor(d / 2);
  const xMax = xMin + w - 1;
  const zMax = zMin + d - 1;
  const wallTopY = count * height - 1;
  return {
    xMin,
    xMax,
    zMin,
    zMax,
    storeyCount: count,
    storeyHeight: height,
    wallTopY,
    roofBaseY: wallTopY + 1,
    mirrorAt2X: xMin + xMax,
    mirrorAt2Z: zMin + zMax,
  };
}

type OpContext = {
  op: string;
  opIndex: number;
  spec: unknown;
};

function reject(ctx: OpContext, message: string): never {
  throw new DslError(message, { op: ctx.op, opIndex: ctx.opIndex, args: ctx.spec });
}

function makeCell(
  ctx: OpContext,
  role: RoleName,
  form: CellForm,
  state?: BlockStateHints,
): RoleCell {
  const cell: RoleCell = { role, form, source: { op: ctx.op, opIndex: ctx.opIndex } };
  if (state && Object.keys(state).length > 0) cell.state = state;
  return cell;
}

function put(
  ctx: OpContext,
  scratch: Scratch,
  x: number,
  y: number,
  z: number,
  cell: RoleCell,
): void {
  if (!isInKeyRange(x, y, z)) {
    reject(ctx, `coordinate (${x}, ${y}, ${z}) is outside the supported build range`);
  }
  writeCell(scratch, x, y, z, cell);
}

function storeyBands(mass: MassInfo, storey: number | null): number[] {
  if (storey === null) {
    return Array.from({ length: mass.storeyCount }, (_, index) => index);
  }
  return [storey];
}

function wallBand(mass: MassInfo, storey: number): { from: number; to: number } {
  const base = storey * mass.storeyHeight;
  return { from: base + 1, to: base + mass.storeyHeight - 1 };
}

function isPerimeter(mass: MassInfo, x: number, z: number): boolean {
  return x === mass.xMin || x === mass.xMax || z === mass.zMin || z === mass.zMax;
}

type FaceInfo = {
  alongAxis: "x" | "z";
  alongMin: number;
  alongMax: number;
  toPosition: (along: number, y: number) => Vec3;
};

function faceInfo(mass: MassInfo, face: Facing): FaceInfo {
  if (face === "north" || face === "south") {
    const z = face === "north" ? mass.zMin : mass.zMax;
    return {
      alongAxis: "x",
      alongMin: mass.xMin,
      alongMax: mass.xMax,
      toPosition: (along, y) => ({ x: along, y, z }),
    };
  }
  const x = face === "west" ? mass.xMin : mass.xMax;
  return {
    alongAxis: "z",
    alongMin: mass.zMin,
    alongMax: mass.zMax,
    toPosition: (along, y) => ({ x, y, z: along }),
  };
}

function openingCells(
  ctx: OpContext,
  mass: MassInfo,
  face: Facing,
  offset: number,
  y: number,
  w: number,
  h: number,
): Vec3[] {
  const info = faceInfo(mass, face);
  const centre = Math.floor((info.alongMin + info.alongMax) / 2);
  const start = centre + offset - Math.floor((w - 1) / 2);
  const end = start + w - 1;
  if (start < info.alongMin || end > info.alongMax) {
    reject(
      ctx,
      `opening spans ${info.alongAxis} ${start}..${end} which leaves the ${face} face (${info.alongMin}..${info.alongMax})`,
    );
  }
  if (y < 0 || y + h - 1 > mass.wallTopY) {
    reject(
      ctx,
      `opening spans y ${y}..${y + h - 1} which leaves the wall band (0..${mass.wallTopY})`,
    );
  }
  const cells: Vec3[] = [];
  for (let along = start; along <= end; along += 1) {
    for (let level = y; level < y + h; level += 1) {
      cells.push(info.toPosition(along, level));
    }
  }
  return cells;
}

function applyOpening(
  ctx: OpContext,
  scratch: Scratch,
  face: Facing,
  cells: Vec3[],
  role: RoleName | null,
): void {
  for (const cell of cells) {
    if (role === null) {
      carveCell(scratch, cell.x, cell.y, cell.z);
    } else {
      put(ctx, scratch, cell.x, cell.y, cell.z, makeCell(ctx, role, "full"));
    }
  }
  scratch.openings.push({ face, opIndex: ctx.opIndex, cells: cells.map((cell) => ({ ...cell })) });
}

type RoofRow = { level: number; downhill: Facing | null };

function gableRows(
  mass: MassInfo,
  spec: OpSpecMap["gableRoof"],
): { lo: number; hi: number; rowFor: (coordinate: number) => RoofRow } {
  const acrossLo = spec.axis === "x" ? mass.zMin - spec.overhang : mass.xMin - spec.overhang;
  const acrossHi = spec.axis === "x" ? mass.zMax + spec.overhang : mass.xMax + spec.overhang;
  const negative: Facing = spec.axis === "x" ? "north" : "west";
  const positive: Facing = spec.axis === "x" ? "south" : "east";

  return {
    lo: acrossLo,
    hi: acrossHi,
    rowFor: (coordinate) => {
      const fromLow = coordinate - acrossLo;
      const fromHigh = acrossHi - coordinate;
      const steps = Math.min(fromLow, fromHigh);
      const level = steps * spec.pitch;
      if (fromLow === fromHigh) return { level, downhill: null };
      return { level, downhill: fromLow < fromHigh ? negative : positive };
    },
  };
}

function isOverhangCell(mass: MassInfo, x: number, z: number): boolean {
  return x < mass.xMin || x > mass.xMax || z < mass.zMin || z > mass.zMax;
}

function execGableRoof(ctx: OpContext, scratch: Scratch, mass: MassInfo, spec: OpSpecMap["gableRoof"]): void {
  const rows = gableRows(mass, spec);
  const alongLo = spec.axis === "x" ? mass.xMin - spec.overhang : mass.zMin - spec.overhang;
  const alongHi = spec.axis === "x" ? mass.xMax + spec.overhang : mass.zMax + spec.overhang;

  for (let across = rows.lo; across <= rows.hi; across += 1) {
    const row = rows.rowFor(across);
    for (let along = alongLo; along <= alongHi; along += 1) {
      const x = spec.axis === "x" ? along : across;
      const z = spec.axis === "x" ? across : along;
      const y = mass.roofBaseY + row.level;
      const role = spec.trimRole && isOverhangCell(mass, x, z) ? spec.trimRole : spec.role;
      if (row.downhill === null) {
        put(ctx, scratch, x, y, z, makeCell(ctx, role, "full"));
      } else {
        put(
          ctx,
          scratch,
          x,
          y,
          z,
          makeCell(ctx, role, "stair", {
            facing: stairFacingForDownhill(row.downhill),
            half: "bottom",
            shape: "straight",
          }),
        );
      }
    }
  }

  if (!spec.infillRole) return;

  // Gable ends: the triangle between the wall top and the roof surface, on the
  // two faces perpendicular to the ridge.
  const ends = spec.axis === "x" ? [mass.xMin, mass.xMax] : [mass.zMin, mass.zMax];
  for (const end of ends) {
    for (let across = spec.axis === "x" ? mass.zMin : mass.xMin; across <= (spec.axis === "x" ? mass.zMax : mass.xMax); across += 1) {
      const row = rows.rowFor(across);
      for (let y = mass.roofBaseY; y < mass.roofBaseY + row.level; y += 1) {
        const x = spec.axis === "x" ? end : across;
        const z = spec.axis === "x" ? across : end;
        put(ctx, scratch, x, y, z, makeCell(ctx, spec.infillRole, "full"));
      }
    }
  }
}

function execHipRoof(ctx: OpContext, scratch: Scratch, mass: MassInfo, spec: OpSpecMap["hipRoof"]): void {
  const xLo = mass.xMin - spec.overhang;
  const xHi = mass.xMax + spec.overhang;
  const zLo = mass.zMin - spec.overhang;
  const zHi = mass.zMax + spec.overhang;

  for (let x = xLo; x <= xHi; x += 1) {
    for (let z = zLo; z <= zHi; z += 1) {
      const distances: Array<{ facing: Facing; distance: number }> = [
        { facing: "north", distance: z - zLo },
        { facing: "south", distance: zHi - z },
        { facing: "west", distance: x - xLo },
        { facing: "east", distance: xHi - x },
      ];
      let nearest = distances[0]!;
      for (const candidate of distances) {
        if (candidate.distance < nearest.distance) nearest = candidate;
      }
      const level = nearest.distance * spec.pitch;
      const y = mass.roofBaseY + level;
      const role = spec.trimRole && isOverhangCell(mass, x, z) ? spec.trimRole : spec.role;
      const isPeak = distances.every((candidate) => candidate.distance === nearest.distance);
      if (isPeak) {
        put(ctx, scratch, x, y, z, makeCell(ctx, role, "full"));
      } else {
        put(
          ctx,
          scratch,
          x,
          y,
          z,
          makeCell(ctx, role, "stair", {
            facing: stairFacingForDownhill(nearest.facing),
            half: "bottom",
            shape: "straight",
          }),
        );
      }
    }
  }
}

function execLeaf(node: LeafOp, scratch: Scratch, mass: MassInfo): void {
  const ctx: OpContext = { op: node.name, opIndex: node.opIndex, spec: node.spec };

  switch (node.name) {
    case "walls": {
      const spec = node.spec;
      for (const storey of storeyBands(mass, spec.storey)) {
        const band = wallBand(mass, storey);
        for (let y = band.from; y <= band.to; y += 1) {
          for (let x = mass.xMin; x <= mass.xMax; x += 1) {
            for (let z = mass.zMin; z <= mass.zMax; z += 1) {
              if (!isPerimeter(mass, x, z)) continue;
              put(ctx, scratch, x, y, z, makeCell(ctx, spec.role, "full"));
            }
          }
        }
      }
      return;
    }

    case "corners": {
      const spec = node.spec;
      const corners: Array<[number, number]> = [
        [mass.xMin, mass.zMin],
        [mass.xMin, mass.zMax],
        [mass.xMax, mass.zMin],
        [mass.xMax, mass.zMax],
      ];
      for (const storey of storeyBands(mass, spec.storey)) {
        const band = wallBand(mass, storey);
        for (let y = band.from; y <= band.to; y += 1) {
          for (const [x, z] of corners) {
            put(ctx, scratch, x, y, z, makeCell(ctx, spec.role, "full", { axis: "y" }));
          }
        }
      }
      return;
    }

    case "floor":
    case "ceiling": {
      const spec = node.spec;
      const y =
        node.name === "floor"
          ? spec.storey * mass.storeyHeight
          : (spec.storey + 1) * mass.storeyHeight;
      for (let x = mass.xMin; x <= mass.xMax; x += 1) {
        for (let z = mass.zMin; z <= mass.zMax; z += 1) {
          put(ctx, scratch, x, y, z, makeCell(ctx, spec.role, "full"));
        }
      }
      return;
    }

    case "foundation": {
      const spec = node.spec;
      for (let y = -spec.depth; y <= -1; y += 1) {
        for (let x = mass.xMin; x <= mass.xMax; x += 1) {
          for (let z = mass.zMin; z <= mass.zMax; z += 1) {
            put(ctx, scratch, x, y, z, makeCell(ctx, spec.role, "full"));
          }
        }
      }
      return;
    }

    case "opening": {
      const spec = node.spec;
      const cells = openingCells(ctx, mass, spec.face, spec.x, spec.y, spec.w, spec.h);
      applyOpening(ctx, scratch, spec.face, cells, spec.role);
      return;
    }

    case "window": {
      const spec = node.spec;
      const cells = openingCells(ctx, mass, spec.face, spec.x, spec.y, spec.w, spec.h);
      applyOpening(ctx, scratch, spec.face, cells, spec.role);
      return;
    }

    case "door": {
      const spec = node.spec;
      const base = spec.storey * mass.storeyHeight + 1;
      const cells = openingCells(ctx, mass, spec.face, spec.x, base, 1, 2);
      applyOpening(ctx, scratch, spec.face, cells, spec.role);
      return;
    }

    case "gableRoof":
      execGableRoof(ctx, scratch, mass, node.spec);
      return;

    case "hipRoof":
      execHipRoof(ctx, scratch, mass, node.spec);
      return;

    case "flatRoof": {
      const spec = node.spec;
      for (let x = mass.xMin - spec.overhang; x <= mass.xMax + spec.overhang; x += 1) {
        for (let z = mass.zMin - spec.overhang; z <= mass.zMax + spec.overhang; z += 1) {
          const role = spec.trimRole && isOverhangCell(mass, x, z) ? spec.trimRole : spec.role;
          put(ctx, scratch, x, mass.roofBaseY, z, makeCell(ctx, role, "full"));
        }
      }
      return;
    }

    case "post": {
      const spec = node.spec;
      for (let y = spec.from; y <= spec.to; y += 1) {
        put(ctx, scratch, spec.x, y, spec.z, makeCell(ctx, spec.role, "full", { axis: "y" }));
      }
      return;
    }

    case "beam": {
      const spec = node.spec;
      const axis =
        spec.axis ?? (spec.from.x !== spec.to.x ? "x" : spec.from.z !== spec.to.z ? "z" : "y");
      for (let x = spec.from.x; x <= spec.to.x; x += 1) {
        for (let y = spec.from.y; y <= spec.to.y; y += 1) {
          for (let z = spec.from.z; z <= spec.to.z; z += 1) {
            put(ctx, scratch, x, y, z, makeCell(ctx, spec.role, "full", { axis }));
          }
        }
      }
      return;
    }

    case "platform": {
      const spec = node.spec;
      const startX = spec.x - Math.floor((spec.w - 1) / 2);
      const startZ = spec.z - Math.floor((spec.d - 1) / 2);
      for (let x = startX; x < startX + spec.w; x += 1) {
        for (let z = startZ; z < startZ + spec.d; z += 1) {
          const state: BlockStateHints | undefined =
            spec.form === "slab" ? { half: "bottom" } : undefined;
          put(ctx, scratch, x, spec.y, z, makeCell(ctx, spec.role, spec.form, state));
        }
      }
      return;
    }

    case "stairsRun": {
      const spec = node.spec;
      const stepX = Math.sign(spec.to.x - spec.from.x);
      const stepZ = Math.sign(spec.to.z - spec.from.z);
      const stepY = Math.sign(spec.to.y - spec.from.y);
      const steps = Math.abs(spec.to.x - spec.from.x) + Math.abs(spec.to.z - spec.from.z);
      const travel: Facing =
        stepX === 1 ? "east" : stepX === -1 ? "west" : stepZ === 1 ? "south" : "north";
      // Climbing along the direction of travel puts the tall side ahead of you;
      // descending puts it behind.
      const facing = stepY > 0 ? travel : stairFacingForDownhill(travel);
      for (let step = 0; step <= steps; step += 1) {
        const x = spec.from.x + stepX * step;
        const z = spec.from.z + stepZ * step;
        const y = spec.from.y + stepY * step;
        put(
          ctx,
          scratch,
          x,
          y,
          z,
          makeCell(ctx, spec.role, "stair", { facing, half: "bottom", shape: "straight" }),
        );
      }
      return;
    }

    case "fill": {
      const spec = node.spec;
      for (let x = spec.from.x; x <= spec.to.x; x += 1) {
        for (let y = spec.from.y; y <= spec.to.y; y += 1) {
          for (let z = spec.from.z; z <= spec.to.z; z += 1) {
            const state: BlockStateHints | undefined =
              spec.form === "slab" ? { half: "bottom" } : undefined;
            put(ctx, scratch, x, y, z, makeCell(ctx, spec.role, spec.form, state));
          }
        }
      }
      return;
    }

    case "clear": {
      const spec = node.spec;
      for (let x = spec.from.x; x <= spec.to.x; x += 1) {
        for (let y = spec.from.y; y <= spec.to.y; y += 1) {
          for (let z = spec.from.z; z <= spec.to.z; z += 1) {
            carveCell(scratch, x, y, z);
          }
        }
      }
      return;
    }
  }
}

function collectOpIndices(nodes: readonly OpNode[]): number[] {
  const out: number[] = [];
  for (const node of nodes) {
    out.push(node.opIndex);
    if (node.kind !== "op") out.push(...collectOpIndices(node.body));
  }
  return out.sort((a, b) => a - b);
}

function execOps(
  nodes: readonly OpNode[],
  mass: MassInfo,
  mirrors: MirrorRecord[],
): Scratch {
  const scratch = createScratch();

  for (const node of nodes) {
    if (node.kind === "op") {
      execLeaf(node, scratch, mass);
      continue;
    }

    const body = execOps(node.body, mass, mirrors);

    if (node.kind === "mirror") {
      const mirrorAt2 = node.axis === "x" ? mass.mirrorAt2X : mass.mirrorAt2Z;
      mirrors.push({
        axis: node.axis,
        mirrorAt2,
        opIndex: node.opIndex,
        bodyOps: collectOpIndices(node.body),
      });
      const reflected = transformScratch(
        body,
        (position) =>
          node.axis === "x"
            ? { x: mirrorAt2 - position.x, y: position.y, z: position.z }
            : { x: position.x, y: position.y, z: mirrorAt2 - position.z },
        (cell) => mirrorCellState(cell, node.axis),
      );
      for (const opening of reflected.openings) {
        opening.face = mirrorOpeningFace(opening.face, node.axis);
      }
      // The original half is merged first so that on the axis of symmetry, where
      // a cell reflects onto itself, the reflected orientation wins. Both halves
      // are produced by the compiler, never emitted twice by the program.
      mergeScratch(scratch, body);
      mergeScratch(scratch, reflected);
      continue;
    }

    if (node.kind === "translate") {
      const moved = transformScratch(
        body,
        (position) => ({
          x: position.x + node.offset.x,
          y: position.y + node.offset.y,
          z: position.z + node.offset.z,
        }),
        (cell) => cell,
      );
      mergeScratch(scratch, moved);
      continue;
    }

    for (let index = 0; index < node.count; index += 1) {
      const moved = transformScratch(
        body,
        (position) => ({
          x: position.x + node.step.x * index,
          y: position.y + node.step.y * index,
          z: position.z + node.step.z * index,
        }),
        (cell) => cell,
      );
      mergeScratch(scratch, moved);
    }
  }

  return scratch;
}

export function compile(program: Program): RoleGrid {
  const mass = massInfo(program);
  const mirrors: MirrorRecord[] = [];
  const scratch = execOps(program.ops, mass, mirrors);

  deriveStairShapes(scratch);

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const [key, cell] of scratch.cells) {
    if (cell === null) continue;
    const position = unpackKey(key);
    if (position.x < minX) minX = position.x;
    if (position.y < minY) minY = position.y;
    if (position.z < minZ) minZ = position.z;
    if (position.x > maxX) maxX = position.x;
    if (position.y > maxY) maxY = position.y;
    if (position.z > maxZ) maxZ = position.z;
  }

  if (!Number.isFinite(minX)) {
    throw new DslError("the program produced no blocks", { op: "build", opIndex: -1 });
  }

  const size = { w: maxX - minX + 1, h: maxY - minY + 1, d: maxZ - minZ + 1 };
  const origin = { x: minX, y: minY, z: minZ };
  const layer = size.w * size.d;

  const entries: Array<[number, RoleCell]> = [];
  for (const [key, cell] of scratch.cells) {
    if (cell === null) continue;
    const position = unpackKey(key);
    const index =
      (position.y - origin.y) * layer + (position.z - origin.z) * size.w + (position.x - origin.x);
    entries.push([index, cell]);
  }
  entries.sort((a, b) => a[0] - b[0]);

  const openings: OpeningRecord[] = scratch.openings
    .map((opening) => ({
      face: opening.face,
      opIndex: opening.opIndex,
      cells: opening.cells.map((cell) => ({ ...cell })),
    }))
    .sort((a, b) => a.opIndex - b.opIndex);

  return {
    size,
    origin,
    cells: new Map(entries),
    mirrors: mirrors.slice().sort((a, b) => a.opIndex - b.opIndex),
    openings,
  };
}

export { packKey };
