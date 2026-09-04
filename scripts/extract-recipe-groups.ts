import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allBlocks, normalizeBlockId } from "@/lib/palette/blocks";

// Derives acquisition groups by walking Minecraft's recipe JSON back to root
// ingredients. Every stonecutter and crafting output of one material ends up
// under the same root, so a palette that uses deepslate, polished deepslate and
// deepslate tiles counts once against maxDistinctBlocks instead of three times.
//
// Vanilla recipe data is not redistributable, so it is not vendored here. Point
// this script at an extracted data directory:
//
//   pnpm recipes:groups /path/to/data/minecraft/recipe
//
// The derived table is committed, so nothing at build or test time needs a game
// jar.

export const OUTPUT_PATH = join(process.cwd(), "lib", "palette", "acquisition.generated.json");

type RecipeFile = Record<string, unknown>;

function listJsonFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      out.push(...listJsonFiles(path));
    } else if (entry.endsWith(".json")) {
      out.push(path);
    }
  }
  return out;
}

// Ingredient nodes have changed shape across versions: a bare string, an object
// with `item`, an array of either, and tags written as "#minecraft:planks".
// Tags are skipped because they name a set, not a material.
function collectIngredientIds(node: unknown, out: Set<string>): void {
  if (typeof node === "string") {
    if (!node.startsWith("#")) out.add(normalizeBlockId(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectIngredientIds(item, out);
    return;
  }
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record.item === "string") collectIngredientIds(record.item, out);
    if (typeof record.tag === "string") return;
    if (record.ingredient !== undefined) collectIngredientIds(record.ingredient, out);
    if (record.ingredients !== undefined) collectIngredientIds(record.ingredients, out);
    if (record.key !== undefined) collectIngredientIds(Object.values(record.key as object), out);
  }
}

function resultIdOf(recipe: RecipeFile): string | null {
  const result = recipe.result;
  if (typeof result === "string") return normalizeBlockId(result);
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    const id = record.id ?? record.item;
    if (typeof id === "string") return normalizeBlockId(id);
  }
  return null;
}

export function buildEdges(recipes: RecipeFile[]): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  for (const recipe of recipes) {
    const result = resultIdOf(recipe);
    if (!result) continue;
    const ingredients = new Set<string>();
    collectIngredientIds(recipe.ingredient, ingredients);
    collectIngredientIds(recipe.ingredients, ingredients);
    collectIngredientIds(recipe.key, ingredients);
    ingredients.delete(result);
    if (ingredients.size === 0) continue;
    const existing = edges.get(result) ?? new Set<string>();
    for (const ingredient of ingredients) existing.add(ingredient);
    edges.set(result, existing);
  }
  return edges;
}

// The root of a block is the deepest single ingredient chain it came from. A
// recipe with several distinct ingredients is a combination rather than a
// reshaping of one material, so the walk stops there and the block is its own
// root.
export function rootFor(id: string, edges: Map<string, Set<string>>): string {
  const seen = new Set<string>([id]);
  let current = id;
  for (;;) {
    const ingredients = edges.get(current);
    if (!ingredients || ingredients.size !== 1) return current;
    const [next] = Array.from(ingredients);
    if (!next || seen.has(next)) return current;
    seen.add(next);
    current = next;
  }
}

export function deriveGroups(recipes: RecipeFile[]): Record<string, string> {
  const edges = buildEdges(recipes);
  const groups: Record<string, string> = {};
  for (const block of allBlocks()) {
    const root = rootFor(block.id, edges);
    if (root !== block.id) groups[block.id] = root;
  }
  // Blocks that are the root of a group still need to count under it.
  const roots = new Set(Object.values(groups));
  for (const root of roots) groups[root] = root;
  return groups;
}

function main(): void {
  const dir = process.argv[2];
  if (!dir) {
    process.stderr.write(
      "Usage: pnpm recipes:groups <path to extracted data/minecraft/recipe>\n",
    );
    process.exitCode = 1;
    return;
  }

  const files = listJsonFiles(dir);
  const recipes: RecipeFile[] = [];
  for (const file of files) {
    try {
      recipes.push(JSON.parse(readFileSync(file, "utf8")) as RecipeFile);
    } catch {
      process.stderr.write(`Skipped unreadable recipe ${file}\n`);
    }
  }

  const groups = deriveGroups(recipes);
  const sorted = Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify({ source: dir, groups: sorted }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `Read ${recipes.length} recipes, wrote ${Object.keys(sorted).length} grouped blocks to ${OUTPUT_PATH}\n`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("extract-recipe-groups.ts")) {
  main();
}
