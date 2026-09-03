import assert from "node:assert/strict";
import { compile } from "../../../lib/compile/compile";
import { DslError } from "../../../lib/dsl/errors";
import { runDslProgram } from "../../../lib/dsl/sandbox";

const HOUSE = `
build(ctx => {
  const m = ctx.mass({ w: 13, d: 9 });
  m.storeys({ count: 2, height: 4 });

  m.walls({ role: 'wall_primary' });
  m.corners({ role: 'structure_post' });
  m.floor({ storey: 0, role: 'floor' });

  m.mirrorX(() => {
    m.opening({ face: 'north', x: 2, y: 2, w: 1, h: 2, role: 'glass' });
  });

  m.gableRoof({ axis: 'x', pitch: 1, overhang: 1,
                role: 'roof_primary', trimRole: 'roof_trim' });

  m.door({ face: 'south', x: 0, role: 'door' });
});
`;

// The example program from the docs runs end to end.
{
  const program = runDslProgram({ source: HOUSE });
  assert.deepEqual(program.mass, { w: 13, d: 9 });
  const grid = compile(program);
  assert.ok(grid.cells.size > 0);
  assert.equal(grid.mirrors.length, 1);
  assert.equal(grid.openings.length, 3);
}

// The same source and seed always produce the same program.
{
  const a = JSON.stringify(runDslProgram({ source: HOUSE, seed: 7 }));
  const b = JSON.stringify(runDslProgram({ source: HOUSE, seed: 7 }));
  assert.equal(a, b);
}

// The seeded generator is deterministic and does not leak into the grid unless
// the program uses it.
{
  const source = `
    build(ctx => {
      const m = ctx.mass({ w: 9, d: 9 });
      const n = Math.floor(ctx.rng() * 3) + 1;
      m.post({ x: 0, z: 0, from: 1, to: n, role: 'structure_post' });
    });
  `;
  const first = compile(runDslProgram({ source, seed: 42 })).cells.size;
  const again = compile(runDslProgram({ source, seed: 42 })).cells.size;
  assert.equal(first, again);
}

// The context exposes nothing but build and Math.
for (const forbidden of ["process", "require", "globalThis.process", "setTimeout", "Function"]) {
  let caught: unknown;
  try {
    runDslProgram({
      source: `build(ctx => { ctx.mass({ w: 5, d: 5 }); void ${forbidden}; });`,
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `expected ${forbidden} to be unavailable in the sandbox`);
}

// Code generation from strings is disabled.
{
  let caught: unknown;
  try {
    runDslProgram({ source: `build(ctx => { ctx.mass({ w: 5, d: 5 }); eval("1 + 1"); });` });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expected eval to be unavailable in the sandbox");
}

// A runaway program is stopped by the timeout rather than hanging the process.
{
  let caught: unknown;
  try {
    runDslProgram({
      source: `build(ctx => { ctx.mass({ w: 5, d: 5 }); while (true) {} });`,
      timeoutMs: 100,
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expected the sandbox timeout to fire");
}

// A program that never calls build, or calls it twice, fails loudly.
{
  let caught: unknown;
  try {
    runDslProgram({ source: `const x = 1;` });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DslError);
  assert.ok(caught.message.includes("never called build()"));
}

{
  let caught: unknown;
  try {
    runDslProgram({
      source: `
        build(ctx => { ctx.mass({ w: 5, d: 5 }); });
        build(ctx => { ctx.mass({ w: 5, d: 5 }); });
      `,
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DslError);
  assert.ok(caught.message.includes("only be called once"));
}

// An empty source is rejected before anything is executed.
{
  let caught: unknown;
  try {
    runDslProgram({ source: "   " });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DslError);
  assert.ok(caught.message.includes("source is empty"));
}

console.log("dsl sandbox ok");
