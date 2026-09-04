import type { RoleName } from "@/lib/build/roles";
import type { RenderSubstitution } from "@/lib/build/renderAdapter";
import type { BudgetReport, MaterialTally, ResolveWarning } from "@/lib/palette/types";
import type { Finding } from "@/lib/repair";
import type { VoxelBuild } from "@/lib/voxel/types";

export type CompileResponse = {
  render: VoxelBuild;
  materials: MaterialTally[];
  budget: BudgetReport;
  warnings: ResolveWarning[];
  findings: Finding[];
  substitutions: RenderSubstitution[];
  stats: {
    blockCount: number;
    interiorVolume: number;
    size: { w: number; h: number; d: number };
  };
};

export type RoleBindingDraft = {
  role: RoleName;
  block: string;
  state?: Record<string, string>;
  ramp?: string;
};

export type ApiError = {
  error: { code: string; message: string; details?: unknown };
};

export function readApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as ApiError).error;
    if (error && typeof error.message === "string") return error.message;
  }
  return fallback;
}
