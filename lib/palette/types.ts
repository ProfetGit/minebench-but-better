import type { RoleName } from "@/lib/build/roles";
import type { RoleGrid, Vec3 } from "@/lib/build/types";

export type BlockState = Record<string, string>;

export type ResolvedBlock = {
  x: number;
  y: number;
  z: number;
  id: string;
  state?: BlockState;
};

export type MaterialTally = {
  id: string;
  name: string;
  count: number;
  cost: number;
  // The acquisition group this block belongs to, when recipe data is available.
  group: string | null;
};

export type ResolveWarningKind =
  | "unmapped_role"
  | "unknown_block"
  | "missing_variant"
  | "excluded_block"
  | "empty_ramp";

export type ResolveWarning = {
  kind: ResolveWarningKind;
  message: string;
  role?: RoleName;
  block?: string;
  coords?: Vec3;
};

export type BudgetOverage = {
  kind: "distinct_blocks" | "cost" | "excluded_block";
  message: string;
  actual: number;
  limit: number | null;
};

export type BudgetReport = {
  distinctBlocks: number;
  maxDistinctBlocks: number | null;
  cost: number;
  maxCost: number | null;
  withinBudget: boolean;
  overages: BudgetOverage[];
  // False while no recipe data has been supplied, in which case every block
  // counts separately instead of per acquisition group.
  acquisitionGroupsAvailable: boolean;
};

export type ResolvedBuild = {
  grid: RoleGrid;
  paletteName: string;
  blocks: ResolvedBlock[];
  materials: MaterialTally[];
  warnings: ResolveWarning[];
  budget: BudgetReport;
};
