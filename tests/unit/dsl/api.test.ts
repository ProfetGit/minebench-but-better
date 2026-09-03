import assert from "node:assert/strict";
import { buildProgram } from "../../../lib/dsl/api";
import { DslError } from "../../../lib/dsl/errors";

function expectDslError(fn: () => void, expected: { op: string; includes: string }): DslError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DslError, `expected a DslError, received ${String(caught)}`);
  assert.equal(caught.op, expected.op);
  assert.ok(
    caught.message.includes(expected.includes),
    `expected message to include ${JSON.stringify(expected.includes)}, received ${caught.message}`,
  );
  return caught;
}

// A minimal valid program records the mass, the storeys and the ops in order.
{
  const program = buildProgram((ctx) => {
    const m = ctx.mass({ w: 13, d: 9 });
    m.storeys({ count: 2, height: 4 });
    m.walls({ role: "wall_primary" });
    m.floor({ storey: 0, role: "floor" });
  });

  assert.deepEqual(program.mass, { w: 13, d: 9 });
  assert.deepEqual(program.storeys, { count: 2, height: 4 });
  assert.equal(program.ops.length, 2);
  assert.equal(program.ops[0]?.name, "walls");
  assert.equal(program.ops[1]?.name, "floor");
  // storeys is configuration, so it does not take an op slot, but it does
  // consume an index so error messages stay aligned with program order.
  assert.equal(program.ops[0]?.opIndex, 1);
}

// Defaults apply when storeys is never declared.
{
  const program = buildProgram((ctx) => {
    const m = ctx.mass({ w: 5, d: 5 });
    m.walls({ role: "wall_primary" });
  });
  assert.deepEqual(program.storeys, { count: 1, height: 4 });
}

// A block id in a role slot is rejected, loudly, with the op and the arguments.
{
  const error = expectDslError(
    () =>
      buildProgram((ctx) => {
        const m = ctx.mass({ w: 7, d: 7 });
        // @ts-expect-error the DSL only accepts semantic roles
        m.walls({ role: "minecraft:spruce_planks" });
      }),
    { op: "walls", includes: "must be a known role" },
  );
  assert.ok(error.message.includes("minecraft:spruce_planks"));
  assert.ok(error.message.includes("op #0"));
}

// Unknown options are a failure, not a silent skip.
expectDslError(
  () =>
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 7, d: 7 });
      // @ts-expect-error height is not an option of walls
      m.walls({ role: "wall_primary", height: 3 });
    }),
  { op: "walls", includes: 'unknown option "height"' },
);

// Non-integer and out-of-range values fail with the offending value.
expectDslError(
  () =>
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 7, d: 7 });
      m.storeys({ count: 1, height: 4.5 });
    }),
  { op: "storeys", includes: "must be an integer" },
);

expectDslError(
  () => buildProgram((ctx) => ctx.mass({ w: 2, d: 7 })),
  { op: "mass", includes: "between 3 and 128" },
);

// Configuration ordering is enforced rather than silently reinterpreted.
expectDslError(
  () =>
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 7, d: 7 });
      m.walls({ role: "wall_primary" });
      m.storeys({ count: 2, height: 4 });
    }),
  { op: "storeys", includes: "before any geometry op" },
);

expectDslError(
  () =>
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 7, d: 7 });
      m.storeys({ count: 1, height: 4 });
      m.storeys({ count: 2, height: 4 });
    }),
  { op: "storeys", includes: "already declared" },
);

expectDslError(
  () =>
    buildProgram((ctx) => {
      ctx.mass({ w: 7, d: 7 });
      ctx.mass({ w: 9, d: 9 });
    }),
  { op: "mass", includes: "only be declared once" },
);

// A storey reference outside the declared storeys is an error.
expectDslError(
  () =>
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 7, d: 7 });
      m.storeys({ count: 2, height: 4 });
      m.floor({ storey: 5, role: "floor" });
    }),
  { op: "floor", includes: "between 0 and 1" },
);

// A program that builds nothing is an error, not an empty grid.
expectDslError(
  () =>
    buildProgram((ctx) => {
      ctx.mass({ w: 7, d: 7 });
    }),
  { op: "build", includes: "recorded no operations" },
);

// Transform scopes validate their own arguments before running the body, and
// reject an empty body.
expectDslError(
  () =>
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 7, d: 7 });
      m.repeat({ count: 3, step: { x: 0, y: 0, z: 0 } }, () => {
        m.post({ x: 0, z: 0, from: 1, to: 3, role: "structure_post" });
      });
    }),
  { op: "repeat", includes: "at least one block" },
);

expectDslError(
  () =>
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 7, d: 7 });
      m.mirrorX(() => {
        // nothing recorded
      });
    }),
  { op: "mirrorX", includes: "recorded no operations" },
);

// Geometric preconditions are checked at record time where they are local to
// the op arguments.
expectDslError(
  () =>
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 9, d: 9 });
      m.beam({ from: { x: 0, y: 1, z: 0 }, to: { x: 2, y: 3, z: 0 }, role: "structure_beam" });
    }),
  { op: "beam", includes: "must be axis aligned" },
);

expectDslError(
  () =>
    buildProgram((ctx) => {
      const m = ctx.mass({ w: 9, d: 9 });
      m.stairsRun({ from: { x: 0, y: 1, z: 0 }, to: { x: 4, y: 3, z: 0 }, role: "floor" });
    }),
  { op: "stairsRun", includes: "one block per block of run" },
);

// Nested transforms record as nested nodes, and op indices are assigned in
// program order across the whole tree.
{
  const program = buildProgram((ctx) => {
    const m = ctx.mass({ w: 9, d: 9 });
    m.mirrorX(() => {
      m.mirrorZ(() => {
        m.post({ x: 3, z: 3, from: 1, to: 3, role: "structure_post" });
      });
    });
  });

  const outer = program.ops[0];
  assert.equal(outer?.kind, "mirror");
  assert.ok(outer.kind === "mirror");
  const inner = outer.body[0];
  assert.equal(inner?.kind, "mirror");
  assert.ok(inner.kind === "mirror");
  assert.equal(inner.body[0]?.name, "post");
}

console.log("dsl api ok");
