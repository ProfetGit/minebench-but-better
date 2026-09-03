import { countingKeyFor, groupFor } from "@/lib/palette/acquisition";
import { getBlock } from "@/lib/palette/blocks";
import type { MaterialTally, ResolvedBlock } from "@/lib/palette/types";

// The material list a player would take into the world, which is also what the
// cost budget is measured against. A block outside the catalogue is still
// listed, at zero cost, so an unknown block shows up rather than disappearing.
export function tallyMaterials(blocks: readonly ResolvedBlock[]): MaterialTally[] {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    counts.set(block.id, (counts.get(block.id) ?? 0) + 1);
  }

  const tallies: MaterialTally[] = [];
  for (const [id, count] of counts) {
    const entry = getBlock(id);
    tallies.push({
      id,
      name: entry?.name ?? id,
      count,
      cost: (entry?.cost ?? 0) * count,
      group: groupFor(id),
    });
  }

  return tallies.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function totalCost(materials: readonly MaterialTally[]): number {
  return materials.reduce((sum, material) => sum + material.cost, 0);
}

// Distinct blocks are counted per acquisition group where one is known, so all
// the stonecutter outputs of one material count once.
export function distinctCountingKeys(ids: Iterable<string>): Set<string> {
  const keys = new Set<string>();
  for (const id of ids) keys.add(countingKeyFor(id));
  return keys;
}
