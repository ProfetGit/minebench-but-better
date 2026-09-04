"use client";

import { useId } from "react";

// The program is the artifact, so this panel is how a build is edited. It is
// not a debug view.
export function DslSourcePanel({
  source,
  onChange,
  onRun,
  busy,
  error,
}: {
  source: string;
  onChange: (value: string) => void;
  onRun: () => void;
  busy: boolean;
  error: string | null;
}) {
  const id = useId();

  return (
    <section className="flex min-h-0 flex-col gap-3" aria-labelledby={`${id}-title`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mb-eyebrow">Program</p>
          <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight text-fg">
            Build source
          </h2>
        </div>
        <button
          type="button"
          className="mb-btn mb-btn-primary h-10"
          onClick={onRun}
          disabled={busy}
        >
          {busy ? "Running" : "Run"}
        </button>
      </div>

      <textarea
        aria-label="Build program"
        spellCheck={false}
        value={source}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onRun();
          }
        }}
        className="min-h-[22rem] w-full flex-1 resize-y rounded-md border border-border/80 bg-card/10 p-3 font-mono text-xs leading-relaxed text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />

      <p className="text-xs text-muted">
        Roles only, never block ids. Symmetry belongs to mirrorX, mirrorZ and
        repeat. Press Control or Command with Enter to run.
      </p>

      {error ? (
        <p role="alert" className="mb-feedback mb-feedback-error whitespace-pre-wrap font-mono text-xs">
          {error}
        </p>
      ) : null}
    </section>
  );
}
