export type DslErrorDetails = {
  op: string;
  opIndex: number;
  args?: unknown;
};

// Every failure carries the op that produced it, its position in the program
// and the arguments it was given. Nothing in the DSL or the compiler is allowed
// to skip an operation quietly.
export class DslError extends Error {
  readonly op: string;
  readonly opIndex: number;
  readonly args: unknown;

  constructor(message: string, details: DslErrorDetails) {
    const position = details.opIndex >= 0 ? ` (op #${details.opIndex})` : "";
    super(`${details.op}${position}: ${message}${formatArgs(details.args)}`);
    this.name = "DslError";
    this.op = details.op;
    this.opIndex = details.opIndex;
    this.args = details.args;
  }
}

function formatArgs(args: unknown): string {
  if (args === undefined) return "";
  let rendered: string;
  try {
    rendered = JSON.stringify(args);
  } catch {
    rendered = String(args);
  }
  if (rendered === undefined) return "";
  const clipped = rendered.length > 400 ? `${rendered.slice(0, 400)}...` : rendered;
  return ` [args: ${clipped}]`;
}
