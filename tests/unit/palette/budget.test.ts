import assert from "node:assert/strict";
import { compile } from "../../../lib/compile/compile";
import { buildProgram } from "../../../lib/dsl/api";
import { acquisitionGroupsAvailable, countingKeyFor } from "../../../lib/palette/acquisition";
import { budgetPreset, evaluateBudget, BUDGET_PRESETS } from "../../../lib/palette/budget";
import { tallyMaterials, totalCost } from "../../../lib/palette/cost";
import { palettePreset } from "../../../lib/palette/presets";
import { resolve } from "../../../lib/palette/resolve";
import { parsePaletteOrThrow } from "../../../lib/palette/schema";
import type { MaterialTally } from "../../../lib/palette/types";

const materials: MaterialTally[] = [
  { id: "minecraft:spruce_planks", name: "Spruce Planks", count: 300, cost: 300, group: null },
  { id: "minecraft:cobblestone", name: "Cobblestone", count: 120, cost: 120, group: null },
  { id: "minecraft:gold_block", name: "Gold Block", count: 4, cost: 360, group: null },
];

// A cost budget can say that four gold blocks of trim are fine while a gold
// roof is not, which a blocklist cannot express.
{
  const trim = evaluateBudget({
    materials,
    declaredBlocks: materials.map((material) => material.id),
    budget: { maxDistinctBlocks: 6, maxCost: 900 },
  });
  assert.equal(trim.cost, 780);
  assert.equal(trim.distinctBlocks, 3);
  assert.equal(trim.withinBudget, true);

  const roof: MaterialTally[] = [
    ...materials.slice(0, 2),
    { id: "minecraft:gold_block", name: "Gold Block", count: 800, cost: 72_000, group: null },
  ];
  const report = evaluateBudget({
    materials: roof,
    declaredBlocks: roof.map((material) => material.id),
    budget: { maxDistinctBlocks: 6, maxCost: 900 },
  });
  assert.equal(report.withinBudget, false);
  assert.deepEqual(
    report.overages.map((overage) => overage.kind),
    ["cost"],
  );
  assert.equal(report.overages[0]?.limit, 900);
}

// The distinct block ceiling counts declared blocks, not placed ones, so a ramp
// counts all its members.
{
  const report = evaluateBudget({
    materials,
    declaredBlocks: [
      ...materials.map((material) => material.id),
      "minecraft:deepslate_tiles",
      "minecraft:polished_deepslate",
      "minecraft:cobbled_deepslate",
      "minecraft:glass",
    ],
    budget: { maxDistinctBlocks: 5, maxCost: null },
  });
  assert.equal(report.distinctBlocks, 7);
  assert.equal(report.withinBudget, false);
  assert.equal(report.overages[0]?.kind, "distinct_blocks");
}

// Include and exclude are manual overrides layered on top of the budget.
{
  const excluded = evaluateBudget({
    materials,
    declaredBlocks: materials.map((material) => material.id),
    budget: { maxDistinctBlocks: 6, maxCost: 900 },
    exclude: ["minecraft:gold_block"],
  });
  assert.equal(excluded.withinBudget, false);
  assert.equal(excluded.overages[0]?.kind, "excluded_block");

  const included = evaluateBudget({
    materials,
    declaredBlocks: materials.map((material) => material.id),
    budget: { maxDistinctBlocks: 2, maxCost: 500 },
    include: ["minecraft:gold_block"],
    exclude: ["minecraft:gold_block"],
  });
  // Gold is exempt from the count, the cost and its own exclusion.
  assert.equal(included.distinctBlocks, 2);
  assert.equal(included.cost, 420);
  assert.equal(included.withinBudget, true);
}

// Presets ship as budgets, not as palettes.
{
  assert.deepEqual(Object.keys(BUDGET_PRESETS).sort(), [
    "creative",
    "early-survival",
    "established",
  ]);
  assert.equal(budgetPreset("creative").maxCost, null);
  assert.ok((budgetPreset("early-survival").maxCost ?? 0) < (budgetPreset("established").maxCost ?? 0));
}

// Until recipe data is supplied there are no acquisition groups, and the report
// says so instead of pretending blocks were grouped.
{
  assert.equal(acquisitionGroupsAvailable(), false);
  assert.equal(countingKeyFor("minecraft:polished_deepslate"), "minecraft:polished_deepslate");
  const report = evaluateBudget({ materials, declaredBlocks: materials.map((m) => m.id) });
  assert.equal(report.acquisitionGroupsAvailable, false);
  assert.equal(report.withinBudget, true);
  assert.equal(report.maxCost, null);
}

// The tally is what a player takes into the world, and it drives the cost.
{
  const grid = compile(
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 7, d: 7 });
      m.storeys({ count: 1, height: 4 });
      m.floor({ storey: 0, role: "floor" });
      m.walls({ role: "wall_primary" });
    }),
  );
  const report = resolve(grid, palettePreset("stone-cottage"));
  const planks = report.materials.find((material) => material.id === "minecraft:oak_planks");
  const bricks = report.materials.find((material) => material.id === "minecraft:stone_bricks");
  assert.ok(planks && bricks);
  assert.equal(planks.count, 49);
  assert.equal(bricks.count, 72);
  assert.equal(bricks.cost, 144);
  assert.equal(totalCost(report.materials), report.budget.cost);
  assert.equal(report.budget.withinBudget, true);
}

// A budget passed at resolve time overrides the one in the palette document,
// which is how the UI applies a preset without rewriting the palette.
{
  const grid = compile(
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 7, d: 7 });
      m.walls({ role: "wall_primary" });
    }),
  );
  const palette = parsePaletteOrThrow({
    name: "Gold walls",
    mcVersion: "1.21",
    roles: { wall_primary: { block: "minecraft:gold_block" } },
    budget: { maxCost: 1_000_000 },
  });
  assert.equal(resolve(grid, palette).budget.withinBudget, true);
  const strict = resolve(grid, palette, { budget: budgetPreset("early-survival") });
  assert.equal(strict.budget.withinBudget, false);
  assert.equal(strict.budget.maxCost, BUDGET_PRESETS["early-survival"].maxCost);
}

// A tally of nothing is still a valid report.
assert.deepEqual(tallyMaterials([]), []);

console.log("palette budget ok");
