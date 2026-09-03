import type { RoleName } from "@/lib/build/roles";
import { cellPosition, getCell, type RoleCell, type RoleGrid } from "@/lib/build/types";
import { getBlock, normalizeBlockId } from "@/lib/palette/blocks";
import { evaluateBudget } from "@/lib/palette/budget";
import { tallyMaterials } from "@/lib/palette/cost";
import { orderRamp, rampIndexFor } from "@/lib/palette/ramps";
import type { PaletteBudget, PaletteDocument, RoleBinding } from "@/lib/palette/schema";
import type {
  BlockState,
  ResolvedBlock,
  ResolvedBuild,
  ResolveWarning,
} from "@/lib/palette/types";

export type ResolveOptions = {
  // Overrides the budget in the palette document, which is how the UI budget
  // selector applies a preset without rewriting the palette.
  budget?: PaletteBudget;
};

// Stage 3. Everything above this line works in semantic roles; block identity
// is decided here and nowhere else, which is what makes a palette swap a
// re-resolve instead of a regeneration.
export function resolve(
  grid: RoleGrid,
  palette: PaletteDocument,
  options: ResolveOptions = {},
): ResolvedBuild {
  const warnings: ResolveWarning[] = [];
  const blocks: ResolvedBlock[] = [];
  const declared = new Set<string>();
  const rampCache = new Map<string, string[]>();
  const openingFaces = buildOpeningFaceMap(grid);
  const warnedRoles = new Set<string>();
  const warnedVariants = new Set<string>();

  for (const [index, cell] of grid.cells) {
    const position = cellPosition(grid, index);
    const binding = palette.roles[cell.role];

    if (!binding) {
      if (!warnedRoles.has(cell.role)) {
        warnedRoles.add(cell.role);
        warnings.push({
          kind: "unmapped_role",
          role: cell.role,
          message: `The palette does not map the role ${cell.role}, so those blocks are missing from the build`,
          coords: position,
        });
      }
      continue;
    }

    const baseId = baseBlockFor(binding, palette, position, rampCache, warnings, cell.role);
    if (!baseId) continue;

    for (const member of declaredBlocksFor(binding, palette, rampCache)) declared.add(member);

    const resolvedId = variantFor(baseId, cell, warnings, warnedVariants, cell.role);
    const state = stateFor(resolvedId, cell, binding, grid, position, openingFaces);

    blocks.push(
      state && Object.keys(state).length > 0
        ? { ...position, id: resolvedId, state }
        : { ...position, id: resolvedId },
    );

    if (!getBlock(resolvedId)) {
      const key = `unknown:${resolvedId}`;
      if (!warnedVariants.has(key)) {
        warnedVariants.add(key);
        warnings.push({
          kind: "unknown_block",
          block: resolvedId,
          role: cell.role,
          message: `${resolvedId} is not in the block catalogue, so it has no cost weight or colour`,
        });
      }
    }
  }

  const materials = tallyMaterials(blocks);
  const budget = evaluateBudget({
    materials,
    declaredBlocks: declared,
    budget: options.budget ?? palette.budget,
    include: palette.include,
    exclude: palette.exclude,
  });

  for (const overage of budget.overages) {
    if (overage.kind !== "excluded_block") continue;
    warnings.push({ kind: "excluded_block", message: overage.message });
  }

  return {
    grid,
    paletteName: palette.name,
    blocks,
    materials,
    warnings,
    budget,
  };
}

function baseBlockFor(
  binding: RoleBinding,
  palette: PaletteDocument,
  position: { x: number; y: number; z: number },
  rampCache: Map<string, string[]>,
  warnings: ResolveWarning[],
  role: RoleName,
): string | null {
  if ("block" in binding) return normalizeBlockId(binding.block);

  const members = rampMembers(binding.ramp, palette, rampCache);
  if (members.length === 0) {
    warnings.push({
      kind: "empty_ramp",
      role,
      message: `The palette maps ${role} to the ramp "${binding.ramp}", which has no members`,
    });
    return null;
  }
  const index = rampIndexFor(position.x, position.y, position.z, members.length);
  return members[index] ?? members[0] ?? null;
}

function rampMembers(
  name: string,
  palette: PaletteDocument,
  cache: Map<string, string[]>,
): string[] {
  const cached = cache.get(name);
  if (cached) return cached;
  const ordered = orderRamp(palette.ramps?.[name] ?? []);
  cache.set(name, ordered);
  return ordered;
}

function declaredBlocksFor(
  binding: RoleBinding,
  palette: PaletteDocument,
  cache: Map<string, string[]>,
): string[] {
  // A ramp is one slot in the document but every member counts separately
  // against the distinct block budget.
  if ("ramp" in binding) return rampMembers(binding.ramp, palette, cache);
  return [normalizeBlockId(binding.block)];
}

function variantFor(
  baseId: string,
  cell: RoleCell,
  warnings: ResolveWarning[],
  warned: Set<string>,
  role: RoleName,
): string {
  if (cell.form === "full") return baseId;

  const entry = getBlock(baseId);
  const variant = cell.form === "slab" ? entry?.variants.slab : entry?.variants.stairs;
  if (variant) return variant;

  const key = `${baseId}:${cell.form}`;
  if (!warned.has(key)) {
    warned.add(key);
    warnings.push({
      kind: "missing_variant",
      role,
      block: baseId,
      message: `${baseId} has no ${cell.form} variant, so the ${cell.form} the compiler asked for is placed as a full block`,
    });
  }
  return baseId;
}

function stateFor(
  resolvedId: string,
  cell: RoleCell,
  binding: RoleBinding,
  grid: RoleGrid,
  position: { x: number; y: number; z: number },
  openingFaces: Map<string, string>,
): BlockState | undefined {
  const entry = getBlock(resolvedId);
  const declared: BlockState = {};
  for (const [key, value] of Object.entries(binding.state ?? {})) {
    declared[key] = String(value);
  }

  // Geometry the compiler derived wins over a palette default, because the
  // palette cannot know which way a roof slopes.
  const derived: BlockState = {};
  const hints = cell.state;

  if (cell.form === "stair") {
    if (hints?.facing) derived.facing = hints.facing;
    derived.half = hints?.half ?? "bottom";
    derived.shape = hints?.shape ?? "straight";
  } else if (cell.form === "slab") {
    derived.type = hints?.half === "top" ? "top" : "bottom";
  }

  if (hints?.axis) derived.axis = hints.axis;

  if (resolvedId.endsWith("_door")) {
    const below = getCell(grid, position.x, position.y - 1, position.z);
    derived.half = below && below.role === cell.role ? "upper" : "lower";
    const face = openingFaces.get(keyOf(position));
    if (face) derived.facing = face;
  }

  const merged = { ...declared, ...derived };
  // Only emit properties the block actually has. An unknown block keeps
  // everything, since there is nothing to check it against.
  if (!entry) return Object.keys(merged).length > 0 ? merged : undefined;

  const allowed = new Set(entry.states);
  const filtered: BlockState = {};
  for (const [key, value] of Object.entries(merged)) {
    if (allowed.has(key)) filtered[key] = value;
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function buildOpeningFaceMap(grid: RoleGrid): Map<string, string> {
  const map = new Map<string, string>();
  for (const opening of grid.openings) {
    for (const cell of opening.cells) {
      map.set(keyOf(cell), opening.face);
    }
  }
  return map;
}

function keyOf(position: { x: number; y: number; z: number }): string {
  return `${position.x},${position.y},${position.z}`;
}
