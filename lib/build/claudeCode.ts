import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

// Generation through the locally installed Claude Code CLI, so a person who is
// already signed in there can generate without pasting an API key. This runs a
// process on the server, so it is off unless the machine opts in, and it is
// meant for a local or self-hosted install rather than a public deployment.

export const CLAUDE_CODE_PREFIX = "claude-code:";

export type ClaudeCodeModel = {
  id: string;
  label: string;
  alias: string;
};

export const CLAUDE_CODE_MODELS: readonly ClaudeCodeModel[] = [
  { id: `${CLAUDE_CODE_PREFIX}opus`, label: "Claude Code: Opus", alias: "opus" },
  { id: `${CLAUDE_CODE_PREFIX}sonnet`, label: "Claude Code: Sonnet", alias: "sonnet" },
  { id: `${CLAUDE_CODE_PREFIX}fable`, label: "Claude Code: Fable", alias: "fable" },
  { id: `${CLAUDE_CODE_PREFIX}haiku`, label: "Claude Code: Haiku", alias: "haiku" },
];

export const DEFAULT_CLAUDE_CODE_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export function isClaudeCodeModel(modelKey: string): boolean {
  return modelKey.startsWith(CLAUDE_CODE_PREFIX);
}

export function claudeCodeModel(modelKey: string): ClaudeCodeModel | undefined {
  return CLAUDE_CODE_MODELS.find((model) => model.id === modelKey);
}

// Spawning a CLI from an HTTP handler is only reasonable on a machine whose
// operator asked for it. Local development counts; a deployment has to say so.
export function claudeCodeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.MINEBENCH_ENABLE_CLAUDE_CODE?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  return env.NODE_ENV !== "production";
}

export function claudeCodeBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.MINEBENCH_CLAUDE_CODE_BIN?.trim() || "claude";
}

// Tools are denied rather than left to the permission prompt, because a print
// mode run has nobody to answer one, and this is a text generation call.
const DENIED_TOOLS = [
  "Bash",
  "Edit",
  "Write",
  "Read",
  "Glob",
  "Grep",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Task",
  "Agent",
];

// The prompt goes in on stdin rather than as a trailing argument, because
// --disallowed-tools is variadic and swallows anything positional after it.
export function buildClaudeCodeArgs(params: { system: string; alias: string }): string[] {
  return [
    "--print",
    "--output-format",
    "json",
    "--model",
    params.alias,
    "--system-prompt",
    params.system,
    "--max-turns",
    "1",
    "--strict-mcp-config",
    "--disallowed-tools",
    DENIED_TOOLS.join(" "),
  ];
}

export type ClaudeCodeJsonOutput = {
  result?: unknown;
  is_error?: unknown;
  subtype?: unknown;
  total_cost_usd?: unknown;
};

export function parseClaudeCodeOutput(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("Claude Code returned nothing");

  let parsed: ClaudeCodeJsonOutput;
  try {
    parsed = JSON.parse(trimmed) as ClaudeCodeJsonOutput;
  } catch {
    // A CLI that printed plain text is still usable; the caller extracts the
    // program from whatever came back.
    return trimmed;
  }

  if (parsed.is_error === true) {
    const detail = typeof parsed.result === "string" ? parsed.result : String(parsed.subtype ?? "");
    throw new Error(`Claude Code failed: ${detail || "unknown error"}`);
  }
  if (typeof parsed.result !== "string" || !parsed.result.trim()) {
    throw new Error("Claude Code returned no text");
  }
  return parsed.result;
}

export type RunClaudeCodeParams = {
  prompt: string;
  system: string;
  alias: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
};

export async function runClaudeCode(params: RunClaudeCodeParams): Promise<string> {
  const env = params.env ?? process.env;
  if (!claudeCodeEnabled(env)) {
    throw new Error("Claude Code generation is disabled on this server");
  }

  const args = buildClaudeCodeArgs({ system: params.system, alias: params.alias });

  return new Promise<string>((resolve, reject) => {
    // Arguments are passed as an array with no shell, and the working directory
    // is a temporary one so the CLI does not pick up this repository's files or
    // its CLAUDE.md.
    const child = spawn(claudeCodeBinary(env), args, {
      cwd: tmpdir(),
      env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdin.on("error", () => {
      // A CLI that exited before reading stdin reports itself through close.
    });
    child.stdin.end(params.prompt, "utf8");

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = params.timeoutMs ?? DEFAULT_CLAUDE_CODE_TIMEOUT_MS;

    const finish = (error: Error | null, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      params.signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value ?? "");
    };

    const kill = (reason: string) => {
      child.kill("SIGTERM");
      finish(new Error(reason));
    };

    const timer = setTimeout(() => kill("Claude Code timed out"), timeoutMs);
    const onAbort = () => kill("Generation was cancelled");
    params.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > MAX_OUTPUT_BYTES) kill("Claude Code produced too much output");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > MAX_OUTPUT_BYTES) stderr = stderr.slice(-MAX_OUTPUT_BYTES);
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        finish(
          new Error(
            `Claude Code is not installed on this machine, or ${claudeCodeBinary(env)} is not on the server's PATH`,
          ),
        );
        return;
      }
      finish(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish(null, stdout);
        return;
      }
      const detail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 500);
      finish(new Error(`Claude Code exited with code ${code}${detail ? `: ${detail}` : ""}`));
    });
  });
}
