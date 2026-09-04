import spruceSurvival from "@/lib/palette/presets/spruce-survival.json";
import stoneCottage from "@/lib/palette/presets/stone-cottage.json";
import { parsePaletteOrThrow, type PaletteDocument } from "@/lib/palette/schema";

export type PalettePresetName = "spruce-survival" | "stone-cottage";

const RAW: Readonly<Record<PalettePresetName, unknown>> = {
  "spruce-survival": spruceSurvival,
  "stone-cottage": stoneCottage,
};

export const PALETTE_PRESET_NAMES = Object.keys(RAW) as PalettePresetName[];

export function palettePreset(name: PalettePresetName): PaletteDocument {
  return parsePaletteOrThrow(RAW[name]);
}
