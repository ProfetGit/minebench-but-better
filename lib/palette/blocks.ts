import catalogue from "@/lib/palette/catalogue.generated.json";

export type BlockColor = { r: number; g: number; b: number; lightness: number };

export type BlockEntry = {
  id: string;
  name: string;
  // Texture key in the shipped pack, used for the palette swatch and by the
  // render adapter.
  texture: string;
  // Rough survival acquisition effort per block placed.
  cost: number;
  // Block state properties this block actually has.
  states: string[];
  variants: { stairs?: string; slab?: string };
  color: BlockColor;
};

const ENTRIES = catalogue as BlockEntry[];

const BY_ID = new Map<string, BlockEntry>(ENTRIES.map((entry) => [entry.id, entry]));

export function allBlocks(): readonly BlockEntry[] {
  return ENTRIES;
}

export function getBlock(id: string): BlockEntry | undefined {
  return BY_ID.get(normalizeBlockId(id));
}

export function isKnownBlock(id: string): boolean {
  return BY_ID.has(normalizeBlockId(id));
}

// Palette documents are written with namespaced ids. A bare id is accepted and
// read as vanilla so hand-written palettes are not a trap.
export function normalizeBlockId(id: string): string {
  const trimmed = id.trim();
  return trimmed.includes(":") ? trimmed : `minecraft:${trimmed}`;
}

export function searchBlocks(query: string, limit = 40): BlockEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return ENTRIES.slice(0, limit);
  const matches = ENTRIES.filter(
    (entry) => entry.id.includes(needle) || entry.name.toLowerCase().includes(needle),
  );
  return matches.slice(0, limit);
}
