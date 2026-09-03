import { buildDslSystemPrompt } from "@/lib/ai/dslPrompt";
import { getModelByKey, type ModelKey } from "@/lib/ai/modelCatalog";
import { anthropicGenerateText } from "@/lib/ai/providers/anthropic";
import { geminiGenerateText } from "@/lib/ai/providers/gemini";
import { openaiGenerateText } from "@/lib/ai/providers/openai";
import { openrouterGenerateText } from "@/lib/ai/providers/openrouter";
import type { ProviderApiKeys } from "@/lib/ai/types";

export const DEFAULT_DSL_MAX_OUTPUT_TOKENS = 8_000;

export type GenerateDslParams = {
  prompt: string;
  modelKey: ModelKey;
  providerKeys?: ProviderApiKeys;
  availableRoles?: readonly string[];
  budgetSummary?: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type GenerateDslResult = {
  source: string;
  modelKey: ModelKey;
  provider: string;
  rawText: string;
};

// OpenAI's text entry point requires a structured output schema, so the program
// comes back as one JSON field there. Every other provider returns the program
// as plain text.
const PROGRAM_SCHEMA = {
  type: "object",
  properties: { program: { type: "string" } },
  required: ["program"],
  additionalProperties: false,
} as const;

export async function generateDslProgram(params: GenerateDslParams): Promise<GenerateDslResult> {
  const model = getModelByKey(params.modelKey);
  if (!model) throw new Error(`Unknown model: ${params.modelKey}`);

  const system = buildDslSystemPrompt({
    prompt: params.prompt,
    availableRoles: params.availableRoles,
    budgetSummary: params.budgetSummary,
  });
  const maxOutputTokens = params.maxOutputTokens ?? DEFAULT_DSL_MAX_OUTPUT_TOKENS;
  const keys = params.providerKeys ?? {};

  const shared = {
    modelId: model.modelId,
    system,
    user: params.prompt,
    signal: params.signal,
  };

  if (model.provider === "anthropic" && keys.anthropic) {
    const { text } = await anthropicGenerateText({
      ...shared,
      apiKey: keys.anthropic,
      maxTokens: maxOutputTokens,
    });
    return { source: extractProgram(text), modelKey: params.modelKey, provider: "anthropic", rawText: text };
  }

  if (model.provider === "gemini" && keys.gemini) {
    const { text } = await geminiGenerateText({
      ...shared,
      apiKey: keys.gemini,
      maxOutputTokens,
    });
    return { source: extractProgram(text), modelKey: params.modelKey, provider: "gemini", rawText: text };
  }

  if (model.provider === "openai" && keys.openai) {
    const { text } = await openaiGenerateText({
      ...shared,
      apiKey: keys.openai,
      maxOutputTokens,
      jsonSchema: PROGRAM_SCHEMA as unknown as Record<string, unknown>,
    });
    return { source: extractProgram(text), modelKey: params.modelKey, provider: "openai", rawText: text };
  }

  if (!keys.openrouter) {
    throw new Error(
      `No usable API key for ${model.displayName}. Provide a ${model.provider} key or an OpenRouter key.`,
    );
  }

  const { text } = await openrouterGenerateText({
    ...shared,
    modelId: model.openRouterModelId ?? model.modelId,
    apiKey: keys.openrouter,
    maxOutputTokens,
  });
  return { source: extractProgram(text), modelKey: params.modelKey, provider: "openrouter", rawText: text };
}

// Models wrap programs in prose or fences even when told not to. The program is
// whatever surrounds the build( call.
export function extractProgram(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("The model returned nothing");

  const fromJson = programFromJson(trimmed);
  if (fromJson) return fromJson.trim();

  const fenced = trimmed.match(/```(?:[a-zA-Z]*)\n([\s\S]*?)```/);
  const body = (fenced?.[1] ?? trimmed).trim();

  const start = body.indexOf("build(");
  if (start === -1) throw new Error("The model did not return a build() program");
  return body.slice(start).trim();
}

function programFromJson(text: string): string | null {
  if (!text.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "program" in parsed) {
      const program = (parsed as { program: unknown }).program;
      if (typeof program === "string" && program.includes("build(")) return program;
    }
  } catch {
    return null;
  }
  return null;
}
