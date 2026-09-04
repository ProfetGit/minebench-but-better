"use client";

import { BUDGET_PRESETS, type BudgetPresetName } from "@/lib/palette/budget";
import type { BudgetReport } from "@/lib/palette/types";

const PRESET_LABELS: Record<BudgetPresetName, string> = {
  "early-survival": "Early survival",
  established: "Established base",
  creative: "Creative",
};

export function BudgetSelector({
  value,
  onChange,
  report,
}: {
  value: BudgetPresetName;
  onChange: (preset: BudgetPresetName) => void;
  report: BudgetReport | null;
}) {
  return (
    <section className="space-y-3" aria-labelledby="budget-title">
      <div>
        <p className="mb-eyebrow">Budget</p>
        <h2 id="budget-title" className="text-lg font-semibold tracking-tight text-fg">
          Cost ceiling
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-md border border-border/70 p-1">
        {(Object.keys(BUDGET_PRESETS) as BudgetPresetName[]).map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={preset === value}
            onClick={() => onChange(preset)}
            className={`h-9 rounded text-xs font-medium transition-colors ${
              preset === value ? "bg-accent text-bg" : "text-muted hover:bg-card/20"
            }`}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
      </div>

      {report ? (
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Cost</dt>
            <dd className={report.maxCost !== null && report.cost > report.maxCost ? "text-red-400" : "text-fg"}>
              {report.cost.toLocaleString("en-US")}
              {report.maxCost !== null ? ` / ${report.maxCost.toLocaleString("en-US")}` : ""}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Distinct blocks</dt>
            <dd
              className={
                report.maxDistinctBlocks !== null && report.distinctBlocks > report.maxDistinctBlocks
                  ? "text-red-400"
                  : "text-fg"
              }
            >
              {report.distinctBlocks}
              {report.maxDistinctBlocks !== null ? ` / ${report.maxDistinctBlocks}` : ""}
            </dd>
          </div>
          {!report.acquisitionGroupsAvailable ? (
            <p className="pt-1 text-muted">
              No recipe data has been supplied, so every block counts on its own
              rather than per acquisition group.
            </p>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
