"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoxelViewerCard } from "@/components/voxel/VoxelViewerCard";
import { BudgetSelector } from "@/components/builder/BudgetSelector";
import { DslSourcePanel } from "@/components/builder/DslSourcePanel";
import { EXAMPLE_PROGRAM } from "@/components/builder/exampleProgram";
import { ExportBar, type ExportFormat } from "@/components/builder/ExportBar";
import { PaletteEditor } from "@/components/builder/PaletteEditor";
import { PromptBox, type ProviderKeyDraft } from "@/components/builder/PromptBox";
import { readApiError, type CompileResponse } from "@/components/builder/types";
import { WarningsPanel } from "@/components/builder/WarningsPanel";
import type { RoleName } from "@/lib/build/roles";
import { normalizeBlockId } from "@/lib/palette/blocks";
import type { BudgetPresetName } from "@/lib/palette/budget";
import { palettePreset, type PalettePresetName } from "@/lib/palette/presets";
import type { PaletteDocument } from "@/lib/palette/schema";

const KEYS_STORAGE = "minebench.builder.provider-keys";
const DEFAULT_PALETTE: PalettePresetName = "spruce-survival";
const DEFAULT_MODEL = "anthropic_claude_opus_5";

function readStoredKeys(): ProviderKeyDraft {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEYS_STORAGE);
    return raw ? (JSON.parse(raw) as ProviderKeyDraft) : {};
  } catch {
    return {};
  }
}

export function Builder() {
  const [prompt, setPrompt] = useState("");
  const [modelKey, setModelKey] = useState(DEFAULT_MODEL);
  const [keys, setKeys] = useState<ProviderKeyDraft>({});
  const [source, setSource] = useState(EXAMPLE_PROGRAM);
  const [palette, setPalette] = useState<PaletteDocument>(() => palettePreset(DEFAULT_PALETTE));
  const [budgetPreset, setBudgetPreset] = useState<BudgetPresetName>("established");
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setKeys(readStoredKeys());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
    } catch {
      // A browser that refuses storage still works, it just forgets the keys.
    }
  }, [keys]);

  const compile = useCallback(
    async (programSource: string, currentPalette: PaletteDocument, preset: BudgetPresetName) => {
      const id = requestId.current + 1;
      requestId.current = id;
      setCompiling(true);
      try {
        const response = await fetch("/api/build/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: programSource,
            palette: currentPalette,
            budgetPreset: preset,
          }),
        });
        const body: unknown = await response.json();
        if (requestId.current !== id) return;
        if (!response.ok) {
          setCompileError(readApiError(body, "The program could not be compiled."));
          return;
        }
        setCompileError(null);
        setResult(body as CompileResponse);
      } catch (error) {
        if (requestId.current !== id) return;
        setCompileError(error instanceof Error ? error.message : "The program could not be compiled.");
      } finally {
        if (requestId.current === id) setCompiling(false);
      }
    },
    [],
  );

  // Palette and budget changes re-resolve the same program. The model is never
  // asked again, so the geometry cannot move underneath the person editing it.
  useEffect(() => {
    const timer = setTimeout(() => {
      void compile(source, palette, budgetPreset);
    }, 250);
    return () => clearTimeout(timer);
    // The source is run explicitly, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, budgetPreset, compile]);

  const runProgram = useCallback(() => {
    void compile(source, palette, budgetPreset);
  }, [budgetPreset, compile, palette, source]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const response = await fetch("/api/build/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, modelKey, providerKeys: keys, budgetPreset }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setGenerateError(readApiError(body, "Generation failed."));
        return;
      }
      const nextSource = (body as { source?: string }).source;
      if (!nextSource) {
        setGenerateError("The model returned no program.");
        return;
      }
      setSource(nextSource);
      await compile(nextSource, palette, budgetPreset);
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [budgetPreset, compile, keys, modelKey, palette, prompt]);

  const exportBuild = useCallback(
    async (format: ExportFormat) => {
      setExporting(format);
      try {
        const response = await fetch("/api/build/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, palette, budgetPreset, format }),
        });
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          setCompileError(readApiError(body, "The export failed."));
          return;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `minebench-build.${format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        setCompileError(error instanceof Error ? error.message : "The export failed.");
      } finally {
        setExporting(null);
      }
    },
    [budgetPreset, palette, source],
  );

  const changeRole = useCallback((role: RoleName, block: string) => {
    setPalette((current) => {
      const roles = { ...current.roles };
      const trimmed = block.trim();
      if (!trimmed) {
        delete roles[role];
      } else {
        const existing = roles[role];
        const state = existing && "state" in existing ? existing.state : undefined;
        roles[role] = state ? { block: normalizeBlockId(trimmed), state } : { block: normalizeBlockId(trimmed) };
      }
      return { ...current, roles };
    });
  }, []);

  const resetPalette = useCallback(() => {
    setPalette(palettePreset(DEFAULT_PALETTE));
  }, []);

  return (
    <div className="mb-fade-in mx-auto w-full max-w-[110rem] py-4 sm:py-8">
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          Build generator
        </h1>
        <p className="max-w-3xl text-sm text-muted">
          A model writes the program, a compiler turns it into structure, and the
          palette decides the blocks. Edit any of the three.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)_20rem] xl:items-start">
        <div className="min-w-0 space-y-8">
          <PromptBox
            prompt={prompt}
            onPromptChange={setPrompt}
            modelKey={modelKey}
            onModelChange={setModelKey}
            keys={keys}
            onKeysChange={setKeys}
            onGenerate={() => void generate()}
            busy={generating}
            error={generateError}
          />
          <DslSourcePanel
            source={source}
            onChange={setSource}
            onRun={runProgram}
            busy={compiling}
            error={compileError}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <VoxelViewerCard
            title="Preview"
            subtitle={
              result
                ? `${result.stats.blockCount.toLocaleString("en-US")} blocks · ${result.stats.size.w} by ${result.stats.size.d} by ${result.stats.size.h}`
                : undefined
            }
            voxelBuild={result?.render ?? null}
            palette="advanced"
            gridSize={256}
            autoRotate
            isLoading={compiling && !result}
            skipValidation
            explorer={{
              id: "builder-preview",
              model: "MineBench",
              prompt: prompt || "Build",
              source: "current",
              checksum: null,
            }}
          />
          <WarningsPanel
            findings={result?.findings ?? []}
            warnings={result?.warnings ?? []}
            substitutions={result?.substitutions ?? []}
            interiorVolume={result?.stats.interiorVolume ?? 0}
          />
        </div>

        <div className="min-w-0 space-y-8">
          <BudgetSelector
            value={budgetPreset}
            onChange={setBudgetPreset}
            report={result?.budget ?? null}
          />
          <PaletteEditor palette={palette} onChangeRole={changeRole} onReset={resetPalette} />
          <ExportBar
            onExport={(format) => void exportBuild(format)}
            busyFormat={exporting}
            disabled={!result}
            materials={result?.materials ?? []}
          />
        </div>
      </div>
    </div>
  );
}
