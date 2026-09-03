"use client";

import type { MaterialTally } from "@/lib/palette/types";

export const EXPORT_FORMATS = ["litematic", "schem", "vox", "glb", "stl"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const LABELS: Record<ExportFormat, string> = {
  litematic: "Litematica",
  schem: "Schematic",
  vox: "MagicaVoxel",
  glb: "glTF",
  stl: "STL",
};

export function ExportBar({
  onExport,
  busyFormat,
  disabled,
  materials,
}: {
  onExport: (format: ExportFormat) => void;
  busyFormat: ExportFormat | null;
  disabled: boolean;
  materials: readonly MaterialTally[];
}) {
  return (
    <section className="space-y-3" aria-labelledby="export-title">
      <h2 id="export-title" className="text-lg font-semibold tracking-tight text-fg">
        Export
      </h2>

      <div className="flex flex-wrap gap-2">
        {EXPORT_FORMATS.map((format) => (
          <button
            key={format}
            type="button"
            className={`mb-btn h-9 ${format === "litematic" ? "mb-btn-primary" : "mb-btn-ghost"}`}
            onClick={() => onExport(format)}
            disabled={disabled || busyFormat !== null}
          >
            {busyFormat === format ? "Preparing" : LABELS[format]}
          </button>
        ))}
      </div>

      {materials.length > 0 ? (
        <details className="rounded border border-border/70 bg-card/10 p-2 text-xs">
          <summary className="cursor-pointer text-muted">
            Material list ({materials.length} blocks)
          </summary>
          <ul className="mt-2 space-y-1">
            {materials.map((material) => (
              <li key={material.id} className="flex justify-between gap-3">
                <span className="truncate text-fg">{material.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {material.count.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
