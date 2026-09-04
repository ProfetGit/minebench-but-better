import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDslSystemPrompt } from "../../lib/ai/dslPrompt";
import { ALL_OP_NAMES } from "../../lib/dsl/program";
import { parseDocumentedOpNames, readDslDoc } from "../../lib/dsl/spec";
import { GENERATED_PATH, renderGeneratedModule } from "../../scripts/build-dsl-prompt";

const doc = readDslDoc();
const documented = parseDocumentedOpNames(doc);

// docs/dsl.md is the source of truth. Every op the code exposes must be
// documented, and the docs must not promise an op the code does not have.
assert.deepEqual(
  documented.slice().sort(),
  ALL_OP_NAMES.slice().sort(),
  "docs/dsl.md and lib/dsl/program.ts disagree about the op list",
);
assert.equal(documented.length, new Set(documented).size, "an op is documented twice");

// The generated prompt module must match the docs. Run `pnpm dsl:prompt`.
assert.equal(
  readFileSync(GENERATED_PATH, "utf8"),
  renderGeneratedModule(doc),
  "lib/ai/dslPrompt.generated.ts is stale, run pnpm dsl:prompt",
);

// The system prompt carries the reference verbatim, so the model cannot be
// told about an op the compiler does not implement.
{
  const prompt = buildDslSystemPrompt({ prompt: "a small starter house" });
  for (const op of ALL_OP_NAMES) {
    assert.ok(prompt.includes(`\`${op}(`), `the system prompt does not document ${op}`);
  }
  assert.ok(prompt.includes("a small starter house"));
  assert.ok(prompt.includes("Never write a Minecraft block id"));
}

console.log("dsl doc sync ok");
