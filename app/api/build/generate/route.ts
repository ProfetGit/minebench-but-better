import { z } from "zod";
import { MODEL_CATALOG, type ModelKey } from "@/lib/ai/modelCatalog";
import { claudeCodeEnabled, claudeCodeModel, isClaudeCodeModel } from "@/lib/build/claudeCode";
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

  const local = isClaudeCodeModel(parsed.data.modelKey)
    ? claudeCodeModel(parsed.data.modelKey)
    : null;

  if (isClaudeCodeModel(parsed.data.modelKey)) {
    if (!claudeCodeEnabled()) {
      return Response.json(
        {
          error: {
            code: "claude_code_disabled",
            message:
              "Claude Code generation is off on this server. Set MINEBENCH_ENABLE_CLAUDE_CODE=1 to turn it on.",
          },
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!local) {
      return Response.json(
        { error: { code: "unknown_model", message: "That Claude Code model does not exist." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const model = local ? null : MODEL_CATALOG.find((entry) => entry.key === parsed.data.modelKey);
  if (!local && !model) {
    return Response.json(
      { error: { code: "unknown_model", message: "That model is not in the catalogue." } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await generateDslProgram({
      prompt: parsed.data.prompt,
      modelKey: local ? local.id : (model!.key as ModelKey),
      providerKeys: parsed.data.providerKeys,
      availableRoles: parsed.data.roles,
      budgetSummary: budgetSummary(parsed.data.budgetPreset),
      signal: request.signal,
    });

    return Response.json(
      {
        source: result.source,
        model: {
          key: local ? local.id : model!.key,
          displayName: local ? local.label : model!.displayName,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    // A missing key is the caller's problem to fix; anything else is upstream.
    const lowered = message.toLowerCase();
    const status =
      lowered.includes("api key") || lowered.includes("not installed") || message.startsWith("Missing")
        ? 400
        : 502;
    return Response.json(
      { error: { code: status === 400 ? "missing_provider_key" : "generation_failed", message } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
