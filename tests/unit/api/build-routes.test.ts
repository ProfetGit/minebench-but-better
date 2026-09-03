import assert from "node:assert/strict";
import { POST as compile } from "../../../app/api/build/compile/route";
import { POST as exportBuild } from "../../../app/api/build/export/route";
import { EXAMPLE_PROGRAM } from "../../../components/builder/exampleProgram";
import { palettePreset } from "../../../lib/palette/presets";
import { isGzipped, readLitematic } from "../../../lib/voxel/export/litematic";

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function main() {
  // Compiling returns everything the builder needs to draw and judge a build.
  {
    const response = await compile(
      post("https://minebench.test/api/build/compile", {
        source: EXAMPLE_PROGRAM,
        budgetPreset: "established",
      }),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      render: { blocks: unknown[] };
      materials: unknown[];
      budget: { withinBudget: boolean };
      findings: unknown[];
      warnings: unknown[];
      stats: { blockCount: number; interiorVolume: number; size: { w: number } };
    };
    assert.ok(body.render.blocks.length > 0);
    assert.equal(body.render.blocks.length, body.stats.blockCount);
    assert.ok(body.materials.length > 0);
    assert.ok(body.stats.interiorVolume > 0);
    assert.equal(body.stats.size.w, 15);
    assert.deepEqual(body.warnings, []);
  }

  // A palette sent by the editor is used instead of the preset.
  {
    const palette = palettePreset("stone-cottage");
    const response = await compile(
      post("https://minebench.test/api/build/compile", {
        source: EXAMPLE_PROGRAM,
        palette,
      }),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { materials: Array<{ id: string }> };
    assert.ok(body.materials.some((material) => material.id === "minecraft:stone_bricks"));
  }

  // An invalid palette is rejected with the paths that are wrong.
  {
    const response = await compile(
      post("https://minebench.test/api/build/compile", {
        source: EXAMPLE_PROGRAM,
        palette: { name: "Broken", mcVersion: "1.21", roles: { not_a_role: { block: "stone" } } },
      }),
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string; details?: unknown } };
    assert.equal(body.error.code, "invalid_palette");
    assert.ok(Array.isArray(body.error.details));
  }

  // A failing program comes back with the op that failed, not a generic error.
  {
    const response = await compile(
      post("https://minebench.test/api/build/compile", {
        source: "build(ctx => { const m = ctx.mass({ w: 9, d: 9 }); m.walls({ role: 'stone' }); });",
      }),
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as {
      error: { code: string; message: string; details?: { op?: string } };
    };
    assert.equal(body.error.code, "program_failed");
    assert.equal(body.error.details?.op, "walls");
    assert.ok(body.error.message.includes("must be a known role"));
  }

  // An empty request body is a request error rather than a crash.
  {
    const response = await compile(
      new Request("https://minebench.test/api/build/compile", { method: "POST" }),
    );
    assert.equal(response.status, 400);
  }

  // Exporting runs the same pipeline and returns a real litematic.
  {
    const response = await exportBuild(
      post("https://minebench.test/api/build/export", {
        source: EXAMPLE_PROGRAM,
        format: "litematic",
        name: "example-house",
      }),
    );
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-disposition") ?? "",
      /filename="example-house\.litematic"/,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(isGzipped(bytes));
    const read = readLitematic(bytes);
    assert.equal(read.metadata.name, "example-house");
    assert.ok(read.blocks.length > 0);
    assert.ok(read.blocks.some((block) => block.id.endsWith("_stairs")));
  }

  // The other formats still go through the render build.
  {
    const response = await exportBuild(
      post("https://minebench.test/api/build/export", {
        source: EXAMPLE_PROGRAM,
        format: "schem",
      }),
    );
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }

  // An unknown format is rejected before anything runs.
  {
    const response = await exportBuild(
      post("https://minebench.test/api/build/export", {
        source: EXAMPLE_PROGRAM,
        format: "obj",
      }),
    );
    assert.equal(response.status, 400);
  }

  console.log("build route checks passed");
}

void main();
