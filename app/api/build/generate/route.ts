import { z } from "zod";
import { MODEL_CATALOG, type ModelKey } from "@/lib/ai/modelCatalog";
import { generateDslProgram } from "@/lib/build/generate";
import { ROLES } from "@/lib/build/roles";
import { BUDGET_PRESETS } from "@/lib/palette/budget";

export const runtime = "nodejs";
export const maxDuration = 300;

const providerKeysSchema = z
  .object({
    openai: z.string().trim().min(1).max(4000).optional(),
    anthropic: z.string().trim().min(1).max(4000).optional(),
    gemini: z.string().trim().min(1).max(4000).optional(),
    openrouter: z.string().trim().min(1).max(4000).optional(),
  })
  .optional();

const requestSchema = z
  .object({
    prompt: z.string().trim().min(3).max(2000),
    modelKey: z.string().trim().min(1).max(200),
    providerKeys: providerKeysSchema,
    budgetPreset: z.enum(["early-survival", "established", "creative"]).optional(),
    roles: z.array(z.enum(ROLES)).max(ROLES.length).optional(),
  })
  .strict();

function budgetSummary(preset: keyof typeof BUDGET_PRESETS | undefined): string | undefined {
  if (!preset) return undefined;
  const budget = BUDGET_PRESETS[preset];
  const parts: string[] = [];
  if (budget.maxDistinctBlocks) parts.push(`at most ${budget.maxDistinctBlocks} distinct blocks`);
  if (budget.maxCost) parts.push(`a build cost under ${budget.maxCost}`);
  if (parts.length === 0) return `${preset}, no limits`;
  return `${preset}, ${parts.join(" and ")}`;
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: { code: "invalid_request", message: "Check the prompt and the model." } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const model = MODEL_CATALOG.find((entry) => entry.key === parsed.data.modelKey);
  if (!model) {
    return Response.json(
      { error: { code: "unknown_model", message: "That model is not in the catalogue." } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await generateDslProgram({
      prompt: parsed.data.prompt,
      modelKey: model.key as ModelKey,
      providerKeys: parsed.data.providerKeys,
      availableRoles: parsed.data.roles,
      budgetSummary: budgetSummary(parsed.data.budgetPreset),
      signal: request.signal,
    });

    return Response.json(
      { source: result.source, model: { key: model.key, displayName: model.displayName } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    // A missing key is the caller's problem to fix; anything else is upstream.
    const status = message.toLowerCase().includes("api key") || message.startsWith("Missing") ? 400 : 502;
    return Response.json(
      { error: { code: status === 400 ? "missing_provider_key" : "generation_failed", message } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
