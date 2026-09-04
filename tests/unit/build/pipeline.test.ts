import assert from "node:assert/strict";
import { EXAMPLE_PROGRAM } from "../../../components/builder/exampleProgram";
import { extractProgram } from "../../../lib/build/generate";
import { runBuildPipeline } from "../../../lib/build/pipeline";
import { budgetPreset } from "../../../lib/palette/budget";
import { palettePreset } from "../../../lib/palette/presets";

// The program the builder opens with must survive the whole pipeline, or the
// first thing anyone sees is an error.
const spruce = palettePreset("spruce-survival");
const result = runBuildPipeline({ source: EXAMPLE_PROGRAM, palette: spruce });

assert.ok(result.blockCount > 500, `expected a real house, got ${result.blockCount} blocks`);
assert.equal(result.render.blocks.length, result.blockCount);
assert.deepEqual(result.warnings, []);
assert.ok(result.interiorVolume > 0, "the example house must have an interior");
assert.deepEqual(
  result.findings.map((finding) => finding.kind),
  [],
  `unexpected findings: ${result.findings.map((finding) => finding.message).join("; ")}`,
);
assert.ok(result.materials.some((material) => material.id === "minecraft:spruce_planks"));
assert.ok(result.blocks.some((block) => block.id.endsWith("_stairs")));
assert.ok(result.blocks.some((block) => block.id === "minecraft:spruce_door"));

// Swapping the palette re-resolves the same geometry.
{
  const stone = runBuildPipeline({ source: EXAMPLE_PROGRAM, palette: palettePreset("stone-cottage") });
  assert.equal(stone.blockCount, result.blockCount);
  assert.deepEqual(stone.size, result.size);
  assert.notEqual(
    stone.blocks.map((block) => block.id).join(","),
    result.blocks.map((block) => block.id).join(","),
  );
}

// A budget passed to the pipeline overrides the palette's own.
{
  const strict = runBuildPipeline({
    source: EXAMPLE_PROGRAM,
    palette: spruce,
    budget: budgetPreset("early-survival"),
  });
  assert.equal(strict.budget.maxCost, budgetPreset("early-survival").maxCost);
  assert.equal(strict.budget.withinBudget, false);
  assert.ok(strict.budget.overages.length > 0);
}

// The pipeline is deterministic.
{
  const again = runBuildPipeline({ source: EXAMPLE_PROGRAM, palette: spruce });
  assert.equal(JSON.stringify(again.blocks), JSON.stringify(result.blocks));
  assert.equal(JSON.stringify(again.findings), JSON.stringify(result.findings));
}

// A broken program fails with the op that broke, not with a generic error.
{
  let caught: unknown;
  try {
    runBuildPipeline({
      source: `build(ctx => { const m = ctx.mass({ w: 9, d: 9 }); m.walls({ role: 'minecraft:stone' }); });`,
      palette: spruce,
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.ok(caught.message.includes("walls"));
  assert.ok(caught.message.includes("must be a known role"));
}

// Extracting the program tolerates the wrappers models put around it.
{
  const bare = "build(ctx => {\n  ctx.mass({ w: 5, d: 5 });\n});";
  assert.equal(extractProgram(bare), bare);
  assert.equal(extractProgram("Here you go:\n```js\n" + bare + "\n```"), bare);
  assert.equal(extractProgram(JSON.stringify({ program: bare })), bare);
  // Structured output inside a fence, which is what Gemini tends to send.
  assert.equal(
    extractProgram("```json\n" + JSON.stringify({ program: bare }) + "\n```"),
    bare,
  );
  // An envelope the model truncated mid-string: the newlines are still escaped
  // and the closing quote never arrived.
  assert.equal(
    extractProgram('{"program": "' + bare.replace(/\n/g, "\\n")),
    bare,
  );
  // And one that closed properly but could not be parsed as a whole.
  assert.equal(
    extractProgram('{"program": "' + bare.replace(/\n/g, "\\n") + '", '),
    bare,
  );

  let caught: unknown;
  try {
    extractProgram("I cannot help with that.");
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.ok(caught.message.includes("did not return a build() program"));
}

console.log("build pipeline ok");
