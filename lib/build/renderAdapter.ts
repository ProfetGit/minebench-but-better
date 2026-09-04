import { isKnownBlockId } from "@/lib/blocks/registry";
import { allBlocks } from "@/lib/palette/blocks";
import type { ResolvedBlock } from "@/lib/palette/types";
import type { VoxelBuild } from "@/lib/voxel/types";

// The three.js renderer meshes full cubes from the small render palette, so the
// preview cannot draw a stair or a slab and does not know every catalogue
// block. Exports carry the exact block and state; the preview shows the base
// block as a full cube and reports what it had to substitute.
//
// Sub-cube preview geometry is a separate piece of work in lib/voxel/mesh.ts.

export const RENDER_FALLBACK_BLOCK = "stone";

export type RenderSubstitution = {
  from: string;
  to: string;
  reason: "no_render_block" | "form_flattened";
  count: number;
};

export type RenderBuild = {
  build: VoxelBuild;
  substitutions: RenderSubstitution[];
};

const VARIANT_TO_BASE = new Map<string, string>();
for (const entry of allBlocks()) {
  if (entry.variants.stairs) VARIANT_TO_BASE.set(entry.variants.stairs, entry.id);
  if (entry.variants.slab) VARIANT_TO_BASE.set(entry.variants.slab, entry.id);
}

function bareId(id: string): string {
  const index = id.indexOf(":");
  return index === -1 ? id : id.slice(index + 1);
}

export function toRenderBuild(blocks: readonly ResolvedBlock[]): RenderBuild {
  const substitutions = new Map<string, RenderSubstitution>();
  const out: VoxelBuild = { version: "1.0", blocks: [] };

  for (const block of blocks) {
    const base = VARIANT_TO_BASE.get(block.id);
    const flattened = base !== undefined;
    const candidate = bareId(base ?? block.id);
    const renderable = isKnownBlockId(candidate);
    const type = renderable ? candidate : RENDER_FALLBACK_BLOCK;

    if (!renderable) {
      record(substitutions, block.id, type, "no_render_block");
    } else if (flattened) {
      record(substitutions, block.id, type, "form_flattened");
    }

    out.blocks.push({ x: block.x, y: block.y, z: block.z, type });
  }

  return {
    build: out,
    substitutions: Array.from(substitutions.values()).sort(
      (a, b) => b.count - a.count || a.from.localeCompare(b.from),
    ),
  };
}

function record(
  map: Map<string, RenderSubstitution>,
  from: string,
  to: string,
  reason: RenderSubstitution["reason"],
): void {
  const key = `${from}:${reason}`;
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  map.set(key, { from, to, reason, count: 1 });
}
