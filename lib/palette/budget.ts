import { acquisitionGroupsAvailable } from "@/lib/palette/acquisition";
import { normalizeBlockId } from "@/lib/palette/blocks";
import { distinctCountingKeys, totalCost } from "@/lib/palette/cost";
import type { PaletteBudget } from "@/lib/palette/schema";
import type { BudgetOverage, BudgetReport, MaterialTally } from "@/lib/palette/types";

export type BudgetPresetName = "early-survival" | "established" | "creative";

// A budget, not a blocklist. Banning gold cannot say that four gold blocks of
// trim are fine while eight hundred as roofing are not; a cost ceiling can.
export const BUDGET_PRESETS: Readonly<Record<BudgetPresetName, PaletteBudget>> = {
  "early-survival": { maxDistinctBlocks: 6, maxCost: 900 },
  established: { maxDistinctBlocks: 12, maxCost: 6_000 },
  creative: { maxDistinctBlocks: null, maxCost: null },
};

export function budgetPreset(name: BudgetPresetName): PaletteBudget {
  return BUDGET_PRESETS[name];
}

export type BudgetInput = {
  materials: readonly MaterialTally[];
  // Blocks the palette declares, including every member of a ramp it uses,
  // whether or not each member happened to be placed.
  declaredBlocks: Iterable<string>;
  budget?: PaletteBudget;
  include?: readonly string[];
  exclude?: readonly string[];
};

export function evaluateBudget(input: BudgetInput): BudgetReport {
  const include = new Set((input.include ?? []).map(normalizeBlockId));
  const exclude = new Set((input.exclude ?? []).map(normalizeBlockId));

  // The include list is a manual override layered on top of the budget: an
  // included block is exempt from both the count and the cost, and beats the
  // exclude list.
  const counted = Array.from(input.declaredBlocks)
    .map(normalizeBlockId)
    .filter((id) => !include.has(id));
  const distinctBlocks = distinctCountingKeys(counted).size;

  const chargeable = input.materials.filter((material) => !include.has(material.id));
  const cost = totalCost(chargeable);

  const maxDistinctBlocks = input.budget?.maxDistinctBlocks ?? null;
  const maxCost = input.budget?.maxCost ?? null;

  const overages: BudgetOverage[] = [];

  if (maxDistinctBlocks !== null && distinctBlocks > maxDistinctBlocks) {
    overages.push({
      kind: "distinct_blocks",
      message: `The palette uses ${distinctBlocks} distinct blocks, over the limit of ${maxDistinctBlocks}`,
      actual: distinctBlocks,
      limit: maxDistinctBlocks,
    });
  }

  if (maxCost !== null && cost > maxCost) {
    overages.push({
      kind: "cost",
      message: `The build costs ${cost}, over the budget of ${maxCost}`,
      actual: cost,
      limit: maxCost,
    });
  }

  for (const material of input.materials) {
    if (!exclude.has(material.id) || include.has(material.id)) continue;
    overages.push({
      kind: "excluded_block",
      message: `${material.name} is on the exclude list but the build places ${material.count} of them`,
      actual: material.count,
      limit: 0,
    });
  }

  return {
    distinctBlocks,
    maxDistinctBlocks,
    cost,
    maxCost,
    withinBudget: overages.length === 0,
    overages,
    acquisitionGroupsAvailable: acquisitionGroupsAvailable(),
  };
}
