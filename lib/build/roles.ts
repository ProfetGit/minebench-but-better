// Semantic roles are the contract between the DSL, the compiler and the palette
// resolver. Stage 1 and stage 2 never see a Minecraft block id; a palette maps
// each role to a concrete block only at stage 3.

export const ROLES = [
  "wall_primary",
  "wall_secondary",
  "structure_post",
  "structure_beam",
  "foundation",
  "floor",
  "ceiling",
  "roof_primary",
  "roof_trim",
  "roof_support",
  "glass",
  "door",
  "trim",
  "accent",
  "light",
  "path",
] as const;

export type RoleName = (typeof ROLES)[number];

const ROLE_SET: ReadonlySet<string> = new Set<string>(ROLES);

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === "string" && ROLE_SET.has(value);
}
