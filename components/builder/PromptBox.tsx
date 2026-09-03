"use client";

import { useMemo } from "react";
import { MODEL_CATALOG } from "@/lib/ai/modelCatalog";

export type ProviderKeyDraft = {
  openai?: string;
  anthropic?: string;
  gemini?: string;
  openrouter?: string;
};

export function PromptBox({
  prompt,
  onPromptChange,
  modelKey,
  onModelChange,
  keys,
  onKeysChange,
  onGenerate,
  busy,
  error,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  modelKey: string;
  onModelChange: (value: string) => void;
  keys: ProviderKeyDraft;
  onKeysChange: (keys: ProviderKeyDraft) => void;
  onGenerate: () => void;
  busy: boolean;
  error: string | null;
}) {
  const models = useMemo(() => MODEL_CATALOG.filter((model) => model.enabled !== false), []);
  const selected = models.find((model) => model.key === modelKey) ?? models[0];
  const provider = selected?.provider ?? "openrouter";
  const directProvider =
    provider === "openai" || provider === "anthropic" || provider === "gemini" ? provider : null;

  return (
    <section className="space-y-3" aria-labelledby="prompt-title">
      <div>
        <p className="mb-eyebrow">Prompt</p>
        <h2 id="prompt-title" className="text-lg font-semibold tracking-tight text-fg">
          Describe the build
        </h2>
      </div>

      <textarea
        aria-label="Build prompt"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder="A two storey spruce farmhouse with a steep roof and a small porch"
        className="h-24 w-full resize-y rounded-md border border-border/80 bg-card/10 p-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex-1 text-xs text-muted">
          Model
          <select
            value={selected?.key ?? ""}
            onChange={(event) => onModelChange(event.target.value)}
            className="mt-1 h-9 w-full rounded border border-border/80 bg-card/10 px-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {models.map((model) => (
              <option key={model.key} value={model.key}>
                {model.displayName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="mb-btn mb-btn-primary h-9 self-end"
          onClick={onGenerate}
          disabled={busy || prompt.trim().length < 3}
        >
          {busy ? "Writing the program" : "Generate"}
        </button>
      </div>

      <details className="rounded border border-border/70 bg-card/10 p-2 text-xs">
        <summary className="cursor-pointer text-muted">API keys</summary>
        <p className="mt-2 text-muted">
          Keys stay in this browser and are sent only with a generation request.
        </p>
        <div className="mt-2 space-y-2">
          {directProvider ? (
            <label className="block text-muted">
              {directProvider} key
              <input
                type="password"
                autoComplete="off"
                value={keys[directProvider] ?? ""}
                onChange={(event) =>
                  onKeysChange({ ...keys, [directProvider]: event.target.value })
                }
                className="mt-1 h-8 w-full rounded border border-border/80 bg-card/10 px-2 font-mono text-[11px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
          ) : null}
          <label className="block text-muted">
            OpenRouter key
            <input
              type="password"
              autoComplete="off"
              value={keys.openrouter ?? ""}
              onChange={(event) => onKeysChange({ ...keys, openrouter: event.target.value })}
              className="mt-1 h-8 w-full rounded border border-border/80 bg-card/10 px-2 font-mono text-[11px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
        </div>
      </details>

      {error ? (
        <p role="alert" className="mb-feedback mb-feedback-error text-xs">
          {error}
        </p>
      ) : null}
    </section>
  );
}
