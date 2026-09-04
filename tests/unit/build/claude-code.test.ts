import assert from "node:assert/strict";
import {
  buildClaudeCodeArgs,
  claudeCodeBinary,
  claudeCodeTimeoutMs,
  DEFAULT_CLAUDE_CODE_TIMEOUT_MS,
  claudeCodeEnabled,
  claudeCodeModel,
  CLAUDE_CODE_MODELS,
  isClaudeCodeModel,
  parseClaudeCodeOutput,
  runClaudeCode,
} from "../../../lib/build/claudeCode";
import { GET as generators } from "../../../app/api/build/generators/route";

const DENIED_TOOLS_SENTINEL = buildClaudeCodeArgs({ system: "s", alias: "opus" }).at(-1) ?? "";

// Local generator ids are namespaced so they cannot collide with a catalogue
// model key.
for (const model of CLAUDE_CODE_MODELS) {
  assert.ok(isClaudeCodeModel(model.id));
  assert.equal(claudeCodeModel(model.id)?.alias, model.alias);
}
assert.equal(isClaudeCodeModel("anthropic_claude_opus_5"), false);
assert.equal(claudeCodeModel("claude-code:nope"), undefined);

// Spawning a process from an HTTP handler is opt-in on a deployment and on by
// default only where someone is developing.
assert.equal(claudeCodeEnabled({ NODE_ENV: "development" } as NodeJS.ProcessEnv), true);
assert.equal(claudeCodeEnabled({ NODE_ENV: "production" } as NodeJS.ProcessEnv), false);
assert.equal(
  claudeCodeEnabled({ NODE_ENV: "production", MINEBENCH_ENABLE_CLAUDE_CODE: "1" } as NodeJS.ProcessEnv),
  true,
);
assert.equal(
  claudeCodeEnabled({ NODE_ENV: "development", MINEBENCH_ENABLE_CLAUDE_CODE: "0" } as NodeJS.ProcessEnv),
  false,
);
assert.equal(claudeCodeBinary({} as unknown as NodeJS.ProcessEnv), "claude");
assert.equal(
  claudeCodeBinary({ MINEBENCH_CLAUDE_CODE_BIN: "/opt/claude" } as unknown as NodeJS.ProcessEnv),
  "/opt/claude",
);

// The wait is generous by default, because a measured Opus run on a complex
// build took 320 seconds, nearly all of it thinking.
assert.equal(claudeCodeTimeoutMs({} as unknown as NodeJS.ProcessEnv), DEFAULT_CLAUDE_CODE_TIMEOUT_MS);
assert.ok(DEFAULT_CLAUDE_CODE_TIMEOUT_MS >= 600_000);
assert.equal(
  claudeCodeTimeoutMs({ MINEBENCH_CLAUDE_CODE_TIMEOUT_MS: "120000" } as unknown as NodeJS.ProcessEnv),
  120_000,
);
// Out of range values are clamped rather than trusted.
assert.equal(
  claudeCodeTimeoutMs({ MINEBENCH_CLAUDE_CODE_TIMEOUT_MS: "5" } as unknown as NodeJS.ProcessEnv),
  30_000,
);
assert.equal(
  claudeCodeTimeoutMs({ MINEBENCH_CLAUDE_CODE_TIMEOUT_MS: "nonsense" } as unknown as NodeJS.ProcessEnv),
  DEFAULT_CLAUDE_CODE_TIMEOUT_MS,
);

// The prompt never reaches argv at all: it goes in on stdin, because
// --disallowed-tools is variadic and swallows a trailing positional argument.
// Tools are denied because a print mode run has nobody to answer a permission
// prompt.
{
  const args = buildClaudeCodeArgs({ system: "system text", alias: "opus" });
  assert.equal(args.at(-1), DENIED_TOOLS_SENTINEL);
  assert.ok(args.includes("--print"));
  assert.deepEqual(args.slice(args.indexOf("--output-format"), args.indexOf("--output-format") + 2), [
    "--output-format",
    "json",
  ]);
  assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2), [
    "--model",
    "opus",
  ]);
  assert.deepEqual(args.slice(args.indexOf("--max-turns"), args.indexOf("--max-turns") + 2), [
    "--max-turns",
    "1",
  ]);
  const denied = args[args.indexOf("--disallowed-tools") + 1] ?? "";
  for (const tool of ["Bash", "Edit", "Write", "WebFetch"]) {
    assert.ok(denied.includes(tool), `${tool} should be denied`);
  }
  assert.equal(args[args.indexOf("--system-prompt") + 1], "system text");
}

// The CLI's JSON envelope, its plain text mode, and its failures.
{
  assert.equal(
    parseClaudeCodeOutput(JSON.stringify({ type: "result", is_error: false, result: "build(...)" })),
    "build(...)",
  );
  assert.equal(parseClaudeCodeOutput("  build(...)  "), "build(...)");

  for (const [payload, expected] of [
    [JSON.stringify({ is_error: true, result: "credit balance too low" }), "credit balance"],
    [JSON.stringify({ is_error: false, result: "" }), "no text"],
    ["   ", "returned nothing"],
  ] as const) {
    let caught: unknown;
    try {
      parseClaudeCodeOutput(payload);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof Error, `expected ${payload} to fail`);
    assert.ok(caught.message.includes(expected), caught.message);
  }
}

async function main() {
  // A disabled server refuses before spawning anything.
  {
    let caught: unknown;
    try {
      await runClaudeCode({
        prompt: "a hut",
        system: "system",
        alias: "opus",
        env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
      });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof Error);
    assert.ok(caught.message.includes("disabled"));
  }

  // A missing binary is reported as such rather than as a generation failure.
  {
    let caught: unknown;
    try {
      await runClaudeCode({
        prompt: "a hut",
        system: "system",
        alias: "opus",
        env: {
          NODE_ENV: "development",
          MINEBENCH_CLAUDE_CODE_BIN: "minebench-no-such-binary",
        } as NodeJS.ProcessEnv,
      });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof Error);
    assert.ok(caught.message.includes("not installed"), caught.message);
  }

  // The generators route reports what this server can actually offer.
  {
    const response = generators();
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      claudeCode: { available: boolean; models: Array<{ id: string; label: string }> };
    };
    assert.equal(typeof body.claudeCode.available, "boolean");
    if (body.claudeCode.available) {
      assert.equal(body.claudeCode.models.length, CLAUDE_CODE_MODELS.length);
      assert.ok(body.claudeCode.models.every((model) => model.id.startsWith("claude-code:")));
    } else {
      assert.deepEqual(body.claudeCode.models, []);
    }
  }

  console.log("claude code generator checks passed");
}

void main();
