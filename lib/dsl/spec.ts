import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DSL_DOC_PATH = join(process.cwd(), "docs", "dsl.md");

// docs/dsl.md is the single source of truth for the op list. Each op is
// documented under a heading of the form "### `opName(...)`", and both the
// generated system prompt and the drift test read the op names from here.
const OP_HEADING = /^###\s+`([A-Za-z][A-Za-z0-9_]*)\(/;

export function readDslDoc(path: string = DSL_DOC_PATH): string {
  return readFileSync(path, "utf8");
}

export function parseDocumentedOpNames(doc: string): string[] {
  const names: string[] = [];
  for (const line of doc.split("\n")) {
    const match = OP_HEADING.exec(line.trim());
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}
