import { z } from "zod";
import { runBuildPipeline } from "@/lib/build/pipeline";
import { DslError } from "@/lib/dsl/errors";
import { getPalette } from "@/lib/blocks/palettes";
import { BUDGET_PRESETS } from "@/lib/palette/budget";
import { palettePreset, PALETTE_PRESET_NAMES } from "@/lib/palette/presets";
import { parsePalette } from "@/lib/palette/schema";
import { exportResolvedBuild, exportVoxelBuild } from "@/lib/voxel/export";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 128 * 1024;

const requestSchema = z
  .object({
    source: z.string().min(1).max(MAX_SOURCE_BYTES),
    format: z.enum(["litematic", "schem", "vox", "glb", "stl"]),
    name: z.string().trim().min(1).max(120).optional(),
    seed: z.number().int().optional(),
    palette: z.unknown().optional(),
    palettePreset: z.enum(["spruce-survival", "stone-cottage"]).optional(),
    budgetPreset: z.enum(["early-survival", "established", "creative"]).optional(),
  })
  .strict();

const MIME_TYPES: Record<string, string> = {
  litematic: "application/octet-stream",
  schem: "application/octet-stream",
  vox: "application/octet-stream",
  glb: "model/gltf-binary",
  stl: "model/stl",
};

function badRequest(code: string, message: string, details?: unknown) {
  return Response.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("invalid_request", "Check the program and the format.");

  const palette = parsed.data.palette
    ? parsePalette(parsed.data.palette)
    : { ok: true as const, palette: palettePreset(parsed.data.palettePreset ?? PALETTE_PRESET_NAMES[0]!) };
  if (!palette.ok) {
    return badRequest("invalid_palette", "The palette document is not valid.", palette.issues);
  }

  try {
    const result = runBuildPipeline({
      source: parsed.data.source,
      palette: palette.palette,
      seed: parsed.data.seed,
      budget: parsed.data.budgetPreset ? BUDGET_PRESETS[parsed.data.budgetPreset] : undefined,
    });

    const name = parsed.data.name ?? "minebench-build";
    const format = parsed.data.format;

    // Litematica is written from the resolved build, because it is the only
    // format here that carries block states. The others go through the render
    // build, where stairs and slabs are already flattened to full cubes.
    const artifact =
      format === "litematic"
        ? exportResolvedBuild(result.blocks, "litematic", {
            name,
            author: "MineBench",
            description: `Palette: ${palette.palette.name}`,
          })
        : exportVoxelBuild(result.render, getPalette("advanced"), format);

    const body = new Uint8Array(artifact.bytes);
    return new Response(body, {
      headers: {
        "Content-Type": MIME_TYPES[format] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}.${format}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DslError) {
      return badRequest("program_failed", error.message, { op: error.op, opIndex: error.opIndex });
    }
    const message = error instanceof Error ? error.message : "The export failed.";
    return badRequest("export_failed", message);
  }
}
