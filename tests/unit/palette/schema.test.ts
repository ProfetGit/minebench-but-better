import assert from "node:assert/strict";
import { PALETTE_PRESET_NAMES, palettePreset } from "../../../lib/palette/presets";
import { parsePalette, parsePaletteOrThrow } from "../../../lib/palette/schema";

// Every shipped preset parses, so a broken preset fails here and not in the UI.
for (const name of PALETTE_PRESET_NAMES) {
  const palette = palettePreset(name);
  assert.ok(palette.name.length > 0);
  assert.ok(Object.keys(palette.roles).length > 0);
}

// A role outside the vocabulary is rejected, with the path to it.
{
  const result = parsePalette({
    name: "Bad role",
    mcVersion: "1.21",
    roles: { wall_tertiary: { block: "minecraft:stone" } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.ok === false);
  assert.ok(result.issues.some((issue) => issue.includes("roles")));
}

// A binding must name a block or a ramp, not neither and not something else.
for (const roles of [
  { wall_primary: {} },
  { wall_primary: { block: "" } },
  { wall_primary: { block: "MINECRAFT:Stone" } },
  { wall_primary: "minecraft:stone" },
]) {
  const result = parsePalette({ name: "Bad binding", mcVersion: "1.21", roles });
  assert.equal(result.ok, false, `expected ${JSON.stringify(roles)} to be rejected`);
}

// Budgets are optional but must be positive when present.
{
  assert.equal(
    parsePalette({
      name: "Bad budget",
      mcVersion: "1.21",
      roles: { wall_primary: { block: "minecraft:stone" } },
      budget: { maxCost: -1 },
    }).ok,
    false,
  );

  const palette = parsePaletteOrThrow({
    name: "No budget",
    mcVersion: "1.21",
    roles: { wall_primary: { block: "minecraft:stone" } },
  });
  assert.equal(palette.budget, undefined);
}

// An empty ramp is rejected at parse time rather than at resolve time.
assert.equal(
  parsePalette({
    name: "Empty ramp",
    mcVersion: "1.21",
    roles: { roof_trim: { ramp: "shades" } },
    ramps: { shades: [] },
  }).ok,
  false,
);

// The thrown form carries every issue, so a hand-edited palette says what is
// wrong in one pass.
{
  let message = "";
  try {
    parsePaletteOrThrow({ name: "", mcVersion: "", roles: {} });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert.ok(message.includes("Invalid palette document"));
  assert.ok(message.includes("name"));
}

console.log("palette schema ok");
