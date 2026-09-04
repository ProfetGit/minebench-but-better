import { z } from "zod";
import { ROLES } from "@/lib/build/roles";

const blockIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9_.-]+(:[a-z0-9_./-]+)?$/, "expected a block id such as minecraft:spruce_planks");

const blockStateSchema = z.record(
  z.string().trim().min(1).max(64),
  z.union([z.string().trim().min(1).max(64), z.number(), z.boolean()]),
);

const roleBindingSchema = z.union([
  z.object({
    block: blockIdSchema,
    state: blockStateSchema.optional(),
  }),
  z.object({
    ramp: z.string().trim().min(1).max(120),
    state: blockStateSchema.optional(),
  }),
]);

export const budgetSchema = z.object({
  maxDistinctBlocks: z.number().int().positive().max(512).nullable().optional(),
  maxCost: z.number().positive().max(10_000_000).nullable().optional(),
});

export const paletteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mcVersion: z.string().trim().min(1).max(20),
  roles: z.record(z.enum(ROLES), roleBindingSchema),
  ramps: z.record(z.string().trim().min(1).max(120), z.array(blockIdSchema).min(1).max(32)).optional(),
  budget: budgetSchema.optional(),
  // Manual overrides layered on top of the budget, never a replacement for it.
  include: z.array(blockIdSchema).max(256).optional(),
  exclude: z.array(blockIdSchema).max(256).optional(),
});

export type PaletteDocument = z.infer<typeof paletteSchema>;
export type PaletteBudget = z.infer<typeof budgetSchema>;
export type RoleBinding = z.infer<typeof roleBindingSchema>;

export type PaletteParseResult =
  | { ok: true; palette: PaletteDocument }
  | { ok: false; issues: string[] };

export function parsePalette(input: unknown): PaletteParseResult {
  const parsed = paletteSchema.safeParse(input);
  if (parsed.success) return { ok: true, palette: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}

export function parsePaletteOrThrow(input: unknown): PaletteDocument {
  const result = parsePalette(input);
  if (!result.ok) {
    throw new Error(`Invalid palette document:\n- ${result.issues.join("\n- ")}`);
  }
  return result.palette;
}
