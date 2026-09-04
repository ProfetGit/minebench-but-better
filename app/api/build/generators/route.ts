import { CLAUDE_CODE_MODELS, claudeCodeEnabled } from "@/lib/build/claudeCode";

export const runtime = "nodejs";

// What the builder may offer besides an API key. The page asks once on load so
// it does not advertise a local CLI on a server that has none.
export function GET() {
  const available = claudeCodeEnabled();
  return Response.json(
    {
      claudeCode: {
        available,
        models: available
          ? CLAUDE_CODE_MODELS.map((model) => ({ id: model.id, label: model.label }))
          : [],
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
