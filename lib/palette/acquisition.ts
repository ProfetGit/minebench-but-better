import generated from "@/lib/palette/acquisition.generated.json";
import { normalizeBlockId } from "@/lib/palette/blocks";

// Acquisition groups say which blocks a player gets from the same material, so
// that every stonecutter output of one stone counts once against a distinct
// block budget. The table is derived by walking Minecraft's own recipe JSON
// back to root ingredients (scripts/extract-recipe-groups.ts), never by hand.
//
// Until recipe data has been supplied the table is empty. In that state every
// block counts on its own and the budget report says so, rather than pretending
// the grouping happened.

export type AcquisitionTable = {
  source: string | null;
  groups: Record<string, string>;
};

const TABLE = generated as AcquisitionTable;

export function acquisitionGroupsAvailable(): boolean {
  return Object.keys(TABLE.groups).length > 0;
}

export function acquisitionSource(): string | null {
  return TABLE.source;
}

export function groupFor(blockId: string): string | null {
  return TABLE.groups[normalizeBlockId(blockId)] ?? null;
}

// The key a block counts under against maxDistinctBlocks: its acquisition group
// when one is known, otherwise the block itself.
export function countingKeyFor(blockId: string): string {
  const id = normalizeBlockId(blockId);
  return TABLE.groups[id] ?? id;
}
