import * as vm from "node:vm";
import { createBuildEntry, type BuildContext } from "@/lib/dsl/api";
import { DslError } from "@/lib/dsl/errors";
import type { Program } from "@/lib/dsl/program";

export const DEFAULT_DSL_TIMEOUT_MS = 2_000;

export type RunDslOptions = {
  source: string;
  seed?: number;
  timeoutMs?: number;
};

// The program is model-authored code executed against a fixed API. The context
// has a null prototype and holds only `build` and `Math`: no timers, no
// require, no process, no network, and code generation from strings is off.
// This is the same trust model as the existing voxel.exec sandbox and it is not
// a boundary against a hostile actor sharing the process.
export function runDslProgram(options: RunDslOptions): Program {
  const source = options.source;
  if (typeof source !== "string" || source.trim().length === 0) {
    throw new DslError("the program source is empty", { op: "build", opIndex: -1 });
  }

  const timeoutMs = Math.max(50, Math.min(30_000, Math.floor(options.timeoutMs ?? DEFAULT_DSL_TIMEOUT_MS)));
  const entry = createBuildEntry(options.seed ?? 1);

  const sandbox: Record<string, unknown> = Object.create(null);
  sandbox.build = (callback: (ctx: BuildContext) => void) => entry.build(callback);
  sandbox.Math = Math;

  const context = vm.createContext(sandbox, {
    name: "minebench-dsl",
    codeGeneration: { strings: false, wasm: false },
  });

  const script = new vm.Script(`"use strict";\n${source}\n`, { filename: "build.dsl.js" });
  script.runInContext(context, { timeout: timeoutMs });

  return entry.finish();
}
