import type { RoleName } from "@/lib/build/roles";
import type { Axis, CellForm, Facing, Vec3 } from "@/lib/build/types";

export type MassSpec = { w: number; d: number };
export type StoreySpec = { count: number; height: number };

export type OpSpecMap = {
  walls: { role: RoleName; storey: number | null };
  corners: { role: RoleName; storey: number | null };
  floor: { role: RoleName; storey: number };
  ceiling: { role: RoleName; storey: number };
  foundation: { role: RoleName; depth: number };
  opening: { face: Facing; x: number; y: number; w: number; h: number; role: RoleName | null };
  door: { face: Facing; x: number; role: RoleName; storey: number };
  window: { face: Facing; x: number; y: number; w: number; h: number; role: RoleName };
  gableRoof: {
    axis: "x" | "z";
    pitch: number;
    overhang: number;
    role: RoleName;
    trimRole: RoleName | null;
    infillRole: RoleName | null;
  };
  hipRoof: {
    pitch: number;
    overhang: number;
    role: RoleName;
    trimRole: RoleName | null;
  };
  flatRoof: { role: RoleName; overhang: number; trimRole: RoleName | null };
  post: { x: number; z: number; from: number; to: number; role: RoleName };
  beam: { from: Vec3; to: Vec3; role: RoleName; axis: Axis | null };
  platform: { x: number; z: number; w: number; d: number; y: number; role: RoleName; form: CellForm };
  stairsRun: { from: Vec3; to: Vec3; role: RoleName };
  fill: { from: Vec3; to: Vec3; role: RoleName; form: CellForm };
  clear: { from: Vec3; to: Vec3 };
};

export type OpName = keyof OpSpecMap;

export type LeafOp = {
  [K in OpName]: { kind: "op"; name: K; opIndex: number; spec: OpSpecMap[K] };
}[OpName];

export type MirrorOp = {
  kind: "mirror";
  name: "mirrorX" | "mirrorZ";
  opIndex: number;
  axis: "x" | "z";
  body: OpNode[];
};

export type RepeatOp = {
  kind: "repeat";
  name: "repeat";
  opIndex: number;
  count: number;
  step: Vec3;
  body: OpNode[];
};

export type TranslateOp = {
  kind: "translate";
  name: "translate";
  opIndex: number;
  offset: Vec3;
  body: OpNode[];
};

export type OpNode = LeafOp | MirrorOp | RepeatOp | TranslateOp;

export type Program = {
  mass: MassSpec;
  storeys: StoreySpec;
  ops: OpNode[];
};

export const LEAF_OP_NAMES: readonly OpName[] = [
  "walls",
  "corners",
  "floor",
  "ceiling",
  "foundation",
  "opening",
  "door",
  "window",
  "gableRoof",
  "hipRoof",
  "flatRoof",
  "post",
  "beam",
  "platform",
  "stairsRun",
  "fill",
  "clear",
];

export const TRANSFORM_OP_NAMES = ["mirrorX", "mirrorZ", "repeat", "translate"] as const;

export const CONFIG_OP_NAMES = ["mass", "storeys"] as const;

// The full public surface, used to keep docs/dsl.md and the generated system
// prompt in sync with the code.
export const ALL_OP_NAMES: readonly string[] = [
  ...CONFIG_OP_NAMES,
  ...LEAF_OP_NAMES,
  ...TRANSFORM_OP_NAMES,
];

export const DEFAULT_STOREYS: StoreySpec = { count: 1, height: 4 };

export const MASS_LIMITS = { minSize: 3, maxSize: 128 } as const;
export const STOREY_LIMITS = { minCount: 1, maxCount: 12, minHeight: 2, maxHeight: 24 } as const;
export const ROOF_LIMITS = { minPitch: 1, maxPitch: 4, maxOverhang: 8 } as const;
export const REPEAT_LIMITS = { minCount: 1, maxCount: 64 } as const;
