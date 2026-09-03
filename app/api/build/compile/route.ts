import { z } from "zod";
import { runBuildPipeline } from "@/lib/build/pipeline";
import { DslError } from "@/lib/dsl/errors";
import { BUDGET_PRESETS, type BudgetPresetName } from "@/lib/palette/budget";
import { palettePreset, PALETTE_PRESET_NAMES } from "@/lib/palette/presets";
import { parsePalette } from "@/lib/palette/schema";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 128 * 1024;

const requestSchema = z
  .object({
    source: z.string().min(1).max(MAX_SOURCE_BYTES),
    seed: z.number().int().optional(),
    palette: z.unknown().optional(),
    palettePreset: z.enum(["spruce-survival", "stone-cottage"]).optional(),
    budgetPreset: z.enum(["early-survival", "established", "creative"]).optional(),
  })
  .strict();

function badRequest(code: string, message: string, details?: unknown) {
  return Response.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return badRequest("invalid_request", "Check the program and palette in the request.");
  }

  const palette = parsed.data.palette
    ? parsePalette(parsed.data.palette)
    : { ok: true as const, palette: palettePreset(parsed.data.palettePreset ?? PALETTE_PRESET_NAMES[0]!) };
  if (!palette.ok) {
    return badRequest("invalid_palette", "The palette document is not valid.", palette.issues);
  }

  const budget = parsed.data.budgetPreset
    ? BUDGET_PRESETS[parsed.data.budgetPreset as BudgetPresetName]
    : undefined;

  try {
    const result = runBuildPipeline({
      source: parsed.data.source,
      palette: palette.palette,
      seed: parsed.data.seed,
      budget,
    });

    return Response.json(
      {
        render: result.render,
        blocks: result.blocks,
        materials: result.materials,
        budget: result.budget,
        warnings: result.warnings,
        findings: result.findings,
        substitutions: result.substitutions,
        stats: {
          blockCount: result.blockCount,
          interiorVolume: result.interiorVolume,
          size: result.size,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // A DslError already names the op, its position and its arguments, so it is
    // returned as written rather than flattened into a generic failure.
    if (error instanceof DslError) {
      return badRequest("program_failed", error.message, { op: error.op, opIndex: error.opIndex });
    }
    const message = error instanceof Error ? error.message : "The program could not be compiled.";
    return badRequest("program_failed", message);
  }
}
