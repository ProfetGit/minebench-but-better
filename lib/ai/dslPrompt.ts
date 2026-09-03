import { DSL_DOC } from "@/lib/ai/dslPrompt.generated";
import { ROLES } from "@/lib/build/roles";

export type DslPromptOptions = {
  prompt: string;
  // Roles the active palette actually maps. A role outside this list still
  // compiles, but the palette would have nothing to resolve it to.
  availableRoles?: readonly string[];
  budgetSummary?: string;
};

export function buildDslSystemPrompt(options: DslPromptOptions): string {
  const roles = options.availableRoles?.length ? options.availableRoles : ROLES;
  const budget = options.budgetSummary?.trim();

  const lines: string[] = [
    "You design Minecraft survival builds by writing a program in the build DSL.",
    "",
    "Output rules:",
    "- Reply with the program only: one call to build(...), no prose, no markdown fence.",
    "- Never write a Minecraft block id. You work in roles; a palette resolves blocks later.",
    "- Never emit a symmetric half twice. Use mirrorX, mirrorZ and repeat.",
    "- Prefer the structural ops over fill. Reach for fill only for shapes the",
    "  structural ops cannot express.",
    "- Build something a player could actually gather and place: sensible scale,",
    "  a real interior, a door, windows, and a roof.",
    "",
    `Roles the current palette resolves: ${roles.join(", ")}.`,
  ];

  if (budget) lines.push(`Budget: ${budget}`);

  lines.push(
    "",
    "The DSL reference follows. It is authoritative; anything not described here",
    "does not exist.",
    "",
    DSL_DOC,
    "",
    `Build request: ${options.prompt}`,
  );

  return lines.join("\n");
}
