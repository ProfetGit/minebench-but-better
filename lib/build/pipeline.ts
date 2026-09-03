import type { RoleGrid } from "@/lib/build/types";
import { toRenderBuild, type RenderSubstitution } from "@/lib/build/renderAdapter";
import { compile } from "@/lib/compile/compile";
import { runDslProgram } from "@/lib/dsl/sandbox";
import type { Program } from "@/lib/dsl/program";
import { resolve } from "@/lib/palette/resolve";
import type { PaletteBudget, PaletteDocument } from "@/lib/palette/schema";
import type {
  BudgetReport,
  MaterialTally,
  ResolvedBlock,
  ResolveWarning,
} from "@/lib/palette/types";
import { runRepairChecks } from "@/lib/repair";
import type { Finding } from "@/lib/repair";
import type { VoxelBuild } from "@/lib/voxel/types";

export type BuildPipelineInput = {
  source: string;
  palette: PaletteDocument;
  seed?: number;
  budget?: PaletteBudget;
  timeoutMs?: number;
};

export type BuildPipelineResult = {
  program: Program;
  grid: RoleGrid;
  blocks: ResolvedBlock[];
  materials: MaterialTally[];
  budget: BudgetReport;
  warnings: ResolveWarning[];
  findings: Finding[];
  interiorVolume: number;
  render: VoxelBuild;
  substitutions: RenderSubstitution[];
  size: { w: number; h: number; d: number };
  blockCount: number;
};

// The whole pipeline in one call: program in, everything the UI needs out.
// Each stage stays independently usable; this only sequences them.
export function runBuildPipeline(input: BuildPipelineInput): BuildPipelineResult {
  const program = runDslProgram({
    source: input.source,
    seed: input.seed,
    timeoutMs: input.timeoutMs,
  });
  const grid = compile(program);
  const resolved = resolve(grid, input.palette, { budget: input.budget });
  const repair = runRepairChecks(grid);
  const render = toRenderBuild(resolved.blocks);

  return {
    program,
    grid,
    blocks: resolved.blocks,
    materials: resolved.materials,
    budget: resolved.budget,
    warnings: resolved.warnings,
    findings: repair.findings,
    interiorVolume: repair.interiorVolume,
    render: render.build,
    substitutions: render.substitutions,
    size: grid.size,
    blockCount: resolved.blocks.length,
  };
}
