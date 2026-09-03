import { buildDslSystemPrompt } from "@/lib/ai/dslPrompt";
import { getModelByKey, type ModelKey } from "@/lib/ai/modelCatalog";
import {
  claudeCodeModel,
  isClaudeCodeModel,
  parseClaudeCodeOutput,
  runClaudeCode,
} from "@/lib/build/claudeCode";
import { anthropicGenerateText } from "@/lib/ai/providers/anthropic";
import { geminiGenerateText } from "@/lib/ai/providers/gemini";
import { openaiGenerateText } from "@/lib/ai/providers/openai";
import { openrouterGenerateText } from "@/lib/ai/providers/openrouter";
import type { ProviderApiKeys } from "@/lib/ai/types";

// A whole building program plus whatever reasoning the model does first. Gemini
// and the OpenAI reasoning models spend part of this budget on thinking, so a
// tight cap comes back as a truncated program rather than an error.
export const DEFAULT_DSL_MAX_OUTPUT_TOKENS = 16_000;

export type GenerateDslParams = {
  prompt: string;
  // A catalogue model key, or a claude-code: id served by the local CLI.
  modelKey: ModelKey | string;
  providerKeys?: ProviderApiKeys;
  availableRoles?: readonly string[];
  budgetSummary?: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type GenerateDslResult = {
  source: string;
  modelKey: string;
  provider: string;
  rawText: string;
};

// OpenAI and Gemini both run their text entry points in structured output mode,
// so the program comes back as one JSON field there. extractProgram unwraps it.
export const PROGRAM_SCHEMA = {
  type: "object",
  properties: { program: { type: "string" } },
  required: ["program"],
  additionalProperties: false,
} as const;

export async function generateDslProgram(params: GenerateDslParams): Promise<GenerateDslResult> {
  const system = buildDslSystemPrompt({
    prompt: params.prompt,
    availableRoles: params.availableRoles,
    budgetSummary: params.budgetSummary,
  });

  // The local CLI signs in on its own, so this path needs no key at all.
  if (isClaudeCodeModel(params.modelKey)) {
    const local = claudeCodeModel(params.modelKey);
    if (!local) throw new Error(`Unknown Claude Code model: ${params.modelKey}`);
    const stdout = await runClaudeCode({
      prompt: params.prompt,
      system,
      alias: local.alias,
      signal: params.signal,
    });
    const text = parseClaudeCodeOutput(stdout);
    return {
      source: extractProgram(text),
      modelKey: params.modelKey,
      provider: "claude-code",
      rawText: text,
    };
  }

  const model = getModelByKey(params.modelKey as ModelKey);
  if (!model) throw new Error(`Unknown model: ${params.modelKey}`);
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
      jsonSchema: PROGRAM_SCHEMA as unknown as Record<string, unknown>,
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

// Models wrap the program in prose, in a markdown fence, in a JSON envelope, or
// in a fenced JSON envelope, and structured output sometimes arrives with the
// newlines still escaped. All of those unwrap to the same program.
export function extractProgram(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("The model returned nothing");

  const body = stripFence(trimmed);

  const fromJson = programFromJson(body);
  if (fromJson) return fromJson.trim();

  const start = body.indexOf("build(");
  if (start === -1) throw new Error("The model did not return a build() program");
  return unescapeIfEscaped(body.slice(start)).trim();
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:[a-zA-Z]*)\n([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
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
    // A truncated or malformed envelope still has the program in it; the caller
    // salvages what is there rather than losing the whole response.
    return null;
  }
  return null;
}

// A program sliced out of a JSON envelope is still escaped: its newlines are
// two characters rather than one. Running that verbatim fails with "Invalid or
// unexpected token" on the first backslash.
function unescapeIfEscaped(source: string): string {
  if (source.includes("\n") || !source.includes("\\n")) return source;

  const end = findClosingQuote(source);
  const escaped = end === -1 ? source : source.slice(0, end);
  try {
    return JSON.parse(`"${escaped}"`) as string;
  } catch {
    // Fall back to the escapes that matter for source code, so a stray escape
    // sequence does not throw away an otherwise usable program.
    return escaped
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

function findClosingQuote(source: string): number {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '"') continue;
    let backslashes = 0;
    for (let back = index - 1; back >= 0 && source[back] === "\\"; back -= 1) backslashes += 1;
    if (backslashes % 2 === 0) return index;
  }
  return -1;
}
