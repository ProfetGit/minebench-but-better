"use client";

import type { RenderSubstitution } from "@/lib/build/renderAdapter";
import type { ResolveWarning } from "@/lib/palette/types";
import type { Finding } from "@/lib/repair";

function coordinateLabel(coords: readonly { x: number; y: number; z: number }[]): string | null {
  const first = coords[0];
  if (!first) return null;
  const rest = coords.length > 1 ? ` and ${coords.length - 1} more` : "";
  return `(${first.x}, ${first.y}, ${first.z})${rest}`;
}

// Findings are reported, never fixed. Anything here can be deliberate, so the
// panel says what was seen and leaves the decision to the person.
export function WarningsPanel({
  findings,
  warnings,
  substitutions,
  interiorVolume,
}: {
  findings: readonly Finding[];
  warnings: readonly ResolveWarning[];
  substitutions: readonly RenderSubstitution[];
  interiorVolume: number;
}) {
  const total = findings.length + warnings.length;

  return (
    <section className="space-y-3" aria-labelledby="warnings-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="warnings-title" className="text-lg font-semibold tracking-tight text-fg">
          Checks
        </h2>
        <span className="text-xs text-muted">
          {total === 0 ? "Nothing to report" : `${total} to look at`}
        </span>
      </div>

      <p className="text-xs text-muted">
        Enclosed interior: {interiorVolume > 0 ? `${interiorVolume.toLocaleString("en-US")} cells` : "none"}
      </p>

      {total === 0 ? null : (
        <ul className="space-y-2">
          {findings.map((finding, index) => (
            <li
              key={`${finding.kind}-${index}`}
              className="rounded border border-border/70 bg-card/10 p-2 text-xs"
            >
              <p className="font-medium text-fg">{finding.message}</p>
              {coordinateLabel(finding.coords) ? (
                <p className="mt-1 font-mono text-[11px] text-muted">
                  {coordinateLabel(finding.coords)}
                </p>
              ) : null}
            </li>
          ))}
          {warnings.map((warning, index) => (
            <li
              key={`${warning.kind}-${index}`}
              className="rounded border border-border/70 bg-card/10 p-2 text-xs"
            >
              <p className="font-medium text-fg">{warning.message}</p>
              {warning.role ? (
                <p className="mt-1 font-mono text-[11px] text-muted">role: {warning.role}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {substitutions.length > 0 ? (
        <details className="rounded border border-border/70 bg-card/10 p-2 text-xs">
          <summary className="cursor-pointer text-muted">
            Preview substitutions ({substitutions.length})
          </summary>
          <p className="mt-2 text-muted">
            The preview draws full cubes only. Exports carry the exact block and
            state.
          </p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-muted">
            {substitutions.map((substitution) => (
              <li key={`${substitution.from}-${substitution.reason}`}>
                {substitution.from} shown as {substitution.to} ({substitution.count})
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
