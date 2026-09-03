import type { RoleName } from "@/lib/build/roles";
import type { Axis, CellForm, Vec3 } from "@/lib/build/types";
import {
  fail,
  optionalEnum,
  optionalInt,
  optionalRole,
  optionalVec3,
  readObject,
  rejectUnknownKeys,
  requireCallback,
  requireFace,
  requireInt,
  requireRange,
  requireRole,
  requireVec3,
  type ArgContext,
} from "@/lib/dsl/args";
import { DslError } from "@/lib/dsl/errors";
import {
  DEFAULT_STOREYS,
  MASS_LIMITS,
  REPEAT_LIMITS,
  ROOF_LIMITS,
  STOREY_LIMITS,
  type LeafOp,
  type OpName,
  type OpNode,
  type OpSpecMap,
  type Program,
} from "@/lib/dsl/program";

const FORMS = ["full", "slab", "stair"] as const;
const AXES = ["x", "y", "z"] as const;
const ROOF_AXES = ["x", "z"] as const;

export type MassHandle = {
  storeys(options: { count?: number; height?: number }): void;
  walls(options: { role: RoleName; storey?: number }): void;
  corners(options: { role: RoleName; storey?: number }): void;
  floor(options: { role: RoleName; storey?: number }): void;
  ceiling(options: { role: RoleName; storey?: number }): void;
  foundation(options: { role: RoleName; depth?: number }): void;
  opening(options: {
    face: string;
    x: number;
    y: number;
    w: number;
    h: number;
    role?: RoleName;
  }): void;
  door(options: { face: string; x: number; role: RoleName; storey?: number }): void;
  window(options: {
    face: string;
    x: number;
    y: number;
    w: number;
    h: number;
    role: RoleName;
  }): void;
  gableRoof(options: {
    axis: "x" | "z";
    pitch?: number;
    overhang?: number;
    role: RoleName;
    trimRole?: RoleName;
    infillRole?: RoleName;
  }): void;
  hipRoof(options: {
    pitch?: number;
    overhang?: number;
    role: RoleName;
    trimRole?: RoleName;
  }): void;
  flatRoof(options: { role: RoleName; overhang?: number; trimRole?: RoleName }): void;
  post(options: { x: number; z: number; from: number; to: number; role: RoleName }): void;
  beam(options: { from: Vec3; to: Vec3; role: RoleName; axis?: Axis }): void;
  platform(options: {
    x: number;
    z: number;
    w: number;
    d: number;
    y: number;
    role: RoleName;
    form?: CellForm;
  }): void;
  stairsRun(options: { from: Vec3; to: Vec3; role: RoleName }): void;
  fill(options: { from: Vec3; to: Vec3; role: RoleName; form?: CellForm }): void;
  clear(options: { from: Vec3; to: Vec3 }): void;
  mirrorX(body: () => void): void;
  mirrorZ(body: () => void): void;
  repeat(options: { count: number; step: Vec3 }, body: () => void): void;
  translate(offset: Vec3, body: () => void): void;
};

export type BuildContext = {
  mass(options: { w: number; d: number }): MassHandle;
  rng(): number;
};

export type BuildEntry = {
  build(callback: (ctx: BuildContext) => void): void;
  finish(): Program;
};

type Recorder = {
  nextIndex: number;
  targets: OpNode[][];
  mass: { w: number; d: number } | null;
  storeys: { count: number; height: number } | null;
  geometryRecorded: boolean;
};

function push(recorder: Recorder, node: OpNode): void {
  const target = recorder.targets[recorder.targets.length - 1];
  if (!target) {
    throw new DslError("no active recording target", { op: node.name, opIndex: node.opIndex });
  }
  target.push(node);
  recorder.geometryRecorded = true;
}

function nextIndex(recorder: Recorder): number {
  const index = recorder.nextIndex;
  recorder.nextIndex += 1;
  return index;
}

function leaf<K extends OpName>(name: K, opIndex: number, spec: OpSpecMap[K]): LeafOp {
  return { kind: "op", name, opIndex, spec } as LeafOp;
}

function storeyOf(
  ctx: ArgContext,
  options: Record<string, unknown>,
  recorder: Recorder,
  required: boolean,
): number | null {
  const storeys = recorder.storeys ?? DEFAULT_STOREYS;
  if (options.storey === undefined) return required ? 0 : null;
  const storey = requireInt(ctx, options, "storey");
  requireRange(ctx, "storey", storey, 0, storeys.count - 1);
  return storey;
}

function orderedBox(ctx: ArgContext, from: Vec3, to: Vec3): { from: Vec3; to: Vec3 } {
  void ctx;
  return {
    from: { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), z: Math.min(from.z, to.z) },
    to: { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y), z: Math.max(from.z, to.z) },
  };
}

function makeMassHandle(recorder: Recorder): MassHandle {
  function record<K extends OpName>(
    name: K,
    raw: unknown,
    allowed: readonly string[],
    buildSpec: (ctx: ArgContext, options: Record<string, unknown>) => OpSpecMap[K],
  ): void {
    const opIndex = nextIndex(recorder);
    const ctx: ArgContext = { op: name, opIndex, raw };
    const options = readObject(ctx);
    rejectUnknownKeys(ctx, options, allowed);
    push(recorder, leaf(name, opIndex, buildSpec(ctx, options)));
  }

  function recordScope<T>(
    name: "mirrorX" | "mirrorZ" | "repeat" | "translate",
    raw: unknown,
    callback: unknown,
    validate: (ctx: ArgContext) => T,
    make: (opIndex: number, body: OpNode[], params: T) => OpNode,
  ): void {
    const opIndex = nextIndex(recorder);
    const ctx: ArgContext = { op: name, opIndex, raw };
    const body = requireCallback(ctx, callback);
    const params = validate(ctx);
    const collected: OpNode[] = [];
    recorder.targets.push(collected);
    try {
      body();
    } finally {
      recorder.targets.pop();
    }
    if (collected.length === 0) {
      fail(ctx, "the body recorded no operations");
    }
    push(recorder, make(opIndex, collected, params));
  }

  const handle: MassHandle = {
    storeys(options) {
      const opIndex = nextIndex(recorder);
      const ctx: ArgContext = { op: "storeys", opIndex, raw: options };
      const source = readObject(ctx);
      rejectUnknownKeys(ctx, source, ["count", "height"]);
      if (recorder.geometryRecorded) {
        fail(ctx, "storeys must be declared before any geometry op");
      }
      if (recorder.storeys) {
        fail(ctx, "storeys was already declared for this mass");
      }
      const count = optionalInt(ctx, source, "count", DEFAULT_STOREYS.count);
      const height = optionalInt(ctx, source, "height", DEFAULT_STOREYS.height);
      requireRange(ctx, "count", count, STOREY_LIMITS.minCount, STOREY_LIMITS.maxCount);
      requireRange(ctx, "height", height, STOREY_LIMITS.minHeight, STOREY_LIMITS.maxHeight);
      recorder.storeys = { count, height };
    },

    walls(options) {
      record("walls", options, ["role", "storey"], (ctx, source) => ({
        role: requireRole(ctx, source, "role"),
        storey: storeyOf(ctx, source, recorder, false),
      }));
    },

    corners(options) {
      record("corners", options, ["role", "storey"], (ctx, source) => ({
        role: requireRole(ctx, source, "role"),
        storey: storeyOf(ctx, source, recorder, false),
      }));
    },

    floor(options) {
      record("floor", options, ["role", "storey"], (ctx, source) => ({
        role: requireRole(ctx, source, "role"),
        storey: storeyOf(ctx, source, recorder, true) ?? 0,
      }));
    },

    ceiling(options) {
      record("ceiling", options, ["role", "storey"], (ctx, source) => ({
        role: requireRole(ctx, source, "role"),
        storey: storeyOf(ctx, source, recorder, true) ?? 0,
      }));
    },

    foundation(options) {
      record("foundation", options, ["role", "depth"], (ctx, source) => {
        const depth = optionalInt(ctx, source, "depth", 1);
        requireRange(ctx, "depth", depth, 1, 16);
        return { role: requireRole(ctx, source, "role"), depth };
      });
    },

    opening(options) {
      record("opening", options, ["face", "x", "y", "w", "h", "role"], (ctx, source) => {
        const w = requireInt(ctx, source, "w");
        const h = requireInt(ctx, source, "h");
        requireRange(ctx, "w", w, 1, MASS_LIMITS.maxSize);
        requireRange(ctx, "h", h, 1, STOREY_LIMITS.maxHeight * STOREY_LIMITS.maxCount);
        return {
          face: requireFace(ctx, source, "face"),
          x: requireInt(ctx, source, "x"),
          y: requireInt(ctx, source, "y"),
          w,
          h,
          role: optionalRole(ctx, source, "role") ?? null,
        };
      });
    },

    door(options) {
      record("door", options, ["face", "x", "role", "storey"], (ctx, source) => ({
        face: requireFace(ctx, source, "face"),
        x: requireInt(ctx, source, "x"),
        role: requireRole(ctx, source, "role"),
        storey: storeyOf(ctx, source, recorder, true) ?? 0,
      }));
    },

    window(options) {
      record("window", options, ["face", "x", "y", "w", "h", "role"], (ctx, source) => {
        const w = requireInt(ctx, source, "w");
        const h = requireInt(ctx, source, "h");
        requireRange(ctx, "w", w, 1, MASS_LIMITS.maxSize);
        requireRange(ctx, "h", h, 1, STOREY_LIMITS.maxHeight * STOREY_LIMITS.maxCount);
        return {
          face: requireFace(ctx, source, "face"),
          x: requireInt(ctx, source, "x"),
          y: requireInt(ctx, source, "y"),
          w,
          h,
          role: requireRole(ctx, source, "role"),
        };
      });
    },

    gableRoof(options) {
      record(
        "gableRoof",
        options,
        ["axis", "pitch", "overhang", "role", "trimRole", "infillRole"],
        (ctx, source) => {
          const pitch = optionalInt(ctx, source, "pitch", 1);
          const overhang = optionalInt(ctx, source, "overhang", 0);
          requireRange(ctx, "pitch", pitch, ROOF_LIMITS.minPitch, ROOF_LIMITS.maxPitch);
          requireRange(ctx, "overhang", overhang, 0, ROOF_LIMITS.maxOverhang);
          return {
            axis: optionalEnum(ctx, source, "axis", ROOF_AXES, "x"),
            pitch,
            overhang,
            role: requireRole(ctx, source, "role"),
            trimRole: optionalRole(ctx, source, "trimRole") ?? null,
            infillRole: optionalRole(ctx, source, "infillRole") ?? null,
          };
        },
      );
    },

    hipRoof(options) {
      record("hipRoof", options, ["pitch", "overhang", "role", "trimRole"], (ctx, source) => {
        const pitch = optionalInt(ctx, source, "pitch", 1);
        const overhang = optionalInt(ctx, source, "overhang", 0);
        requireRange(ctx, "pitch", pitch, ROOF_LIMITS.minPitch, ROOF_LIMITS.maxPitch);
        requireRange(ctx, "overhang", overhang, 0, ROOF_LIMITS.maxOverhang);
        return {
          pitch,
          overhang,
          role: requireRole(ctx, source, "role"),
          trimRole: optionalRole(ctx, source, "trimRole") ?? null,
        };
      });
    },

    flatRoof(options) {
      record("flatRoof", options, ["role", "overhang", "trimRole"], (ctx, source) => {
        const overhang = optionalInt(ctx, source, "overhang", 0);
        requireRange(ctx, "overhang", overhang, 0, ROOF_LIMITS.maxOverhang);
        return {
          role: requireRole(ctx, source, "role"),
          overhang,
          trimRole: optionalRole(ctx, source, "trimRole") ?? null,
        };
      });
    },

    post(options) {
      record("post", options, ["x", "z", "from", "to", "role"], (ctx, source) => {
        const from = requireInt(ctx, source, "from");
        const to = requireInt(ctx, source, "to");
        return {
          x: requireInt(ctx, source, "x"),
          z: requireInt(ctx, source, "z"),
          from: Math.min(from, to),
          to: Math.max(from, to),
          role: requireRole(ctx, source, "role"),
        };
      });
    },

    beam(options) {
      record("beam", options, ["from", "to", "role", "axis"], (ctx, source) => {
        const from = requireVec3(ctx, source, "from");
        const to = requireVec3(ctx, source, "to");
        const differing = [from.x !== to.x, from.y !== to.y, from.z !== to.z].filter(Boolean).length;
        if (differing > 1) {
          fail(ctx, "beam must be axis aligned: exactly one of x, y or z may differ");
        }
        const ordered = orderedBox(ctx, from, to);
        const axisOption = source.axis === undefined ? null : optionalEnum(ctx, source, "axis", AXES, "y");
        return {
          from: ordered.from,
          to: ordered.to,
          role: requireRole(ctx, source, "role"),
          axis: axisOption,
        };
      });
    },

    platform(options) {
      record("platform", options, ["x", "z", "w", "d", "y", "role", "form"], (ctx, source) => {
        const w = requireInt(ctx, source, "w");
        const d = requireInt(ctx, source, "d");
        requireRange(ctx, "w", w, 1, MASS_LIMITS.maxSize);
        requireRange(ctx, "d", d, 1, MASS_LIMITS.maxSize);
        return {
          x: requireInt(ctx, source, "x"),
          z: requireInt(ctx, source, "z"),
          w,
          d,
          y: requireInt(ctx, source, "y"),
          role: requireRole(ctx, source, "role"),
          form: optionalEnum(ctx, source, "form", FORMS, "full"),
        };
      });
    },

    stairsRun(options) {
      record("stairsRun", options, ["from", "to", "role"], (ctx, source) => {
        const from = requireVec3(ctx, source, "from");
        const to = requireVec3(ctx, source, "to");
        if (from.y === to.y) fail(ctx, "stairsRun must change height: from.y and to.y are equal");
        const horizontal = (from.x !== to.x ? 1 : 0) + (from.z !== to.z ? 1 : 0);
        if (horizontal !== 1) {
          fail(ctx, "stairsRun must run along exactly one horizontal axis");
        }
        const rise = Math.abs(to.y - from.y);
        const run = Math.abs(to.x - from.x) + Math.abs(to.z - from.z);
        if (rise !== run) {
          fail(ctx, `stairsRun must rise one block per block of run, received rise ${rise} and run ${run}`);
        }
        return { from, to, role: requireRole(ctx, source, "role") };
      });
    },

    fill(options) {
      record("fill", options, ["from", "to", "role", "form"], (ctx, source) => {
        const ordered = orderedBox(ctx, requireVec3(ctx, source, "from"), requireVec3(ctx, source, "to"));
        return {
          from: ordered.from,
          to: ordered.to,
          role: requireRole(ctx, source, "role"),
          form: optionalEnum(ctx, source, "form", FORMS, "full"),
        };
      });
    },

    clear(options) {
      record("clear", options, ["from", "to"], (ctx, source) => {
        const ordered = orderedBox(ctx, requireVec3(ctx, source, "from"), requireVec3(ctx, source, "to"));
        return { from: ordered.from, to: ordered.to };
      });
    },

    mirrorX(body) {
      recordScope(
        "mirrorX",
        undefined,
        body,
        () => null,
        (opIndex, collected) => ({
          kind: "mirror",
          name: "mirrorX",
          opIndex,
          axis: "x",
          body: collected,
        }),
      );
    },

    mirrorZ(body) {
      recordScope(
        "mirrorZ",
        undefined,
        body,
        () => null,
        (opIndex, collected) => ({
          kind: "mirror",
          name: "mirrorZ",
          opIndex,
          axis: "z",
          body: collected,
        }),
      );
    },

    repeat(options, body) {
      recordScope(
        "repeat",
        options,
        body,
        (ctx) => {
          const source = readObject(ctx);
          rejectUnknownKeys(ctx, source, ["count", "step"]);
          const count = requireInt(ctx, source, "count");
          requireRange(ctx, "count", count, REPEAT_LIMITS.minCount, REPEAT_LIMITS.maxCount);
          const step = requireVec3(ctx, source, "step");
          if (step.x === 0 && step.y === 0 && step.z === 0) {
            fail(ctx, "step must move at least one block on some axis");
          }
          return { count, step };
        },
        (opIndex, collected, params) => ({
          kind: "repeat",
          name: "repeat",
          opIndex,
          count: params.count,
          step: params.step,
          body: collected,
        }),
      );
    },

    translate(offset, body) {
      recordScope(
        "translate",
        offset,
        body,
        (ctx) => {
          const source = readObject(ctx);
          rejectUnknownKeys(ctx, source, ["x", "y", "z"]);
          const resolved = {
            x: optionalInt(ctx, source, "x", 0),
            y: optionalInt(ctx, source, "y", 0),
            z: optionalInt(ctx, source, "z", 0),
          };
          if (resolved.x === 0 && resolved.y === 0 && resolved.z === 0) {
            fail(ctx, "translate offset must move at least one block on some axis");
          }
          return resolved;
        },
        (opIndex, collected, params) => ({
          kind: "translate",
          name: "translate",
          opIndex,
          offset: params,
          body: collected,
        }),
      );
    },
  };

  return handle;
}

function makeRng(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function createBuildEntry(seed = 1): BuildEntry {
  const rootOps: OpNode[] = [];
  const recorder: Recorder = {
    nextIndex: 0,
    targets: [rootOps],
    mass: null,
    storeys: null,
    geometryRecorded: false,
  };
  let called = false;
  const rng = makeRng(seed);

  const context: BuildContext = {
    mass(options) {
      const ctx: ArgContext = { op: "mass", opIndex: -1, raw: options };
      const source = readObject(ctx);
      rejectUnknownKeys(ctx, source, ["w", "d"]);
      if (recorder.mass) fail(ctx, "mass may only be declared once per program");
      const w = requireInt(ctx, source, "w");
      const d = requireInt(ctx, source, "d");
      requireRange(ctx, "w", w, MASS_LIMITS.minSize, MASS_LIMITS.maxSize);
      requireRange(ctx, "d", d, MASS_LIMITS.minSize, MASS_LIMITS.maxSize);
      recorder.mass = { w, d };
      return makeMassHandle(recorder);
    },
    rng,
  };

  return {
    build(callback) {
      if (called) {
        throw new DslError("build() may only be called once per program", {
          op: "build",
          opIndex: -1,
        });
      }
      called = true;
      if (typeof callback !== "function") {
        throw new DslError("build() expects a callback function", { op: "build", opIndex: -1 });
      }
      callback(context);
    },
    finish() {
      if (!called) {
        throw new DslError("the program never called build()", { op: "build", opIndex: -1 });
      }
      if (!recorder.mass) {
        throw new DslError("the program never declared a mass with ctx.mass({ w, d })", {
          op: "mass",
          opIndex: -1,
        });
      }
      if (rootOps.length === 0) {
        throw new DslError("the program recorded no operations", { op: "build", opIndex: -1 });
      }
      return {
        mass: recorder.mass,
        storeys: recorder.storeys ?? { ...DEFAULT_STOREYS },
        ops: rootOps,
      };
    },
  };
}

// Direct entry point for host-side callers and tests. The sandbox uses
// createBuildEntry so it can expose only `build` to the program.
export function buildProgram(callback: (ctx: BuildContext) => void, seed = 1): Program {
  const entry = createBuildEntry(seed);
  entry.build(callback);
  return entry.finish();
}
