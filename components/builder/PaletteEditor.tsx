"use client";

import { useMemo, useState } from "react";
import { ROLES, type RoleName } from "@/lib/build/roles";
import { allBlocks, getBlock, normalizeBlockId } from "@/lib/palette/blocks";
import type { PaletteDocument } from "@/lib/palette/schema";

function swatch(blockId: string): string {
  const entry = getBlock(blockId);
  if (!entry) return "transparent";
  return `rgb(${entry.color.r}, ${entry.color.g}, ${entry.color.b})`;
}

export function PaletteEditor({
  palette,
  onChangeRole,
  onReset,
}: {
  palette: PaletteDocument;
  onChangeRole: (role: RoleName, block: string) => void;
  onReset: () => void;
}) {
  const [query, setQuery] = useState("");
  const blocks = useMemo(() => allBlocks(), []);
  const listId = "palette-block-options";

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return blocks;
    return blocks.filter(
      (block) => block.id.includes(needle) || block.name.toLowerCase().includes(needle),
    );
  }, [blocks, query]);

  return (
    <section className="space-y-3" aria-labelledby="palette-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mb-eyebrow">Palette</p>
          <h2 id="palette-title" className="text-lg font-semibold tracking-tight text-fg">
            {palette.name}
          </h2>
        </div>
        <button type="button" className="mb-btn mb-btn-ghost h-9" onClick={onReset}>
          Reset
        </button>
      </div>

      <label className="block text-xs text-muted">
        Filter blocks
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="deepslate, spruce, glass"
          className="mt-1 h-9 w-full rounded border border-border/80 bg-card/10 px-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>

      <datalist id={listId}>
        {filtered.slice(0, 200).map((block) => (
          <option key={block.id} value={block.id}>
            {block.name}
          </option>
        ))}
      </datalist>

      <ul className="space-y-1.5">
        {ROLES.map((role) => {
          const binding = palette.roles[role];
          const isRamp = binding && "ramp" in binding;
          const value = binding && "block" in binding ? normalizeBlockId(binding.block) : "";
          return (
            <li key={role} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-5 w-5 shrink-0 rounded border border-border/70"
                style={{ background: isRamp ? "transparent" : swatch(value) }}
              />
              <span className="w-36 shrink-0 truncate font-mono text-[11px] text-muted" title={role}>
                {role}
              </span>
              {isRamp ? (
                <span className="flex-1 truncate text-xs text-muted">
                  ramp: {(binding as { ramp: string }).ramp}
                </span>
              ) : (
                <input
                  aria-label={`Block for ${role}`}
                  list={listId}
                  value={value}
                  onChange={(event) => onChangeRole(role, event.target.value)}
                  placeholder="unmapped"
                  className="h-8 min-w-0 flex-1 rounded border border-border/80 bg-card/10 px-2 font-mono text-[11px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted">
        Changing a block re-resolves the build. The program is not run again, so
        the geometry cannot change.
      </p>
    </section>
  );
}
