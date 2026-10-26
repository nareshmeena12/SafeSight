"use client";

import { useState } from "react";
import { CircleAlert, Gauge, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  approachLabels,
  resilienceBand,
  type Resilience,
} from "@/lib/teacher/resilience-schema";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: Resilience; checkedText: string };

/**
 * "Check AI resilience" inside the assignment form: scores the current text,
 * explains why, and offers three rewrites to apply with one click (the
 * teacher still saves the form).
 */
export function ResilienceCheck({
  courseId,
  title,
  instructions,
  aiMode,
  onApply,
}: {
  courseId: string;
  title: string;
  instructions: string;
  aiMode: "learn" | "assist" | "exam";
  onApply: (text: string) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [applied, setApplied] = useState<{ index: number; previous: string } | null>(null);

  async function run() {
    setStatus({ kind: "loading" });
    setApplied(null);
    try {
      const res = await fetch("/api/teacher/resilience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, title, instructions, aiMode }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "We couldn't check this just now. Please try again in a moment.");
      setStatus({ kind: "done", result: body as Resilience, checkedText: instructions });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "We couldn't check this just now." });
    }
  }

  const tooShort = instructions.trim().length < 20 || title.trim().length < 2;
  const stale = status.kind === "done" && !applied && status.checkedText !== instructions;

  return (
    <section aria-labelledby="resilience-title" className="grid gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 id="resilience-title" className="text-label">
            AI resilience
          </h3>
          <p className="text-sm text-muted-foreground">
            How easily could a general chatbot do this whole assignment from the instructions alone?
          </p>
        </div>
        <Button type="button" variant="outline" onClick={run} disabled={tooShort || status.kind === "loading"}>
          <Gauge aria-hidden="true" />
          {status.kind === "loading" ? "Checking…" : status.kind === "done" ? "Check again" : "Check AI resilience"}
        </Button>
      </div>

      <div aria-live="polite" className="grid gap-4">
        {tooShort && status.kind === "idle" ? (
          <p className="text-sm text-muted-foreground">Add a title and a sentence or two of instructions to check them.</p>
        ) : null}
        {status.kind === "loading" ? (
          <div className="grid gap-2" aria-hidden="true">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : null}
        {status.kind === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-small text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {status.message}
          </p>
        ) : null}
        {status.kind === "done" ? (
          <Result
            result={status.result}
            stale={stale}
            applied={applied}
            onApply={(index) => {
              setApplied({ index, previous: applied?.previous ?? instructions });
              onApply(status.result.rewrites[index].instructions);
            }}
            onUndo={() => {
              if (!applied) return;
              onApply(applied.previous);
              setApplied(null);
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function Result({
  result,
  stale,
  applied,
  onApply,
  onUndo,
}: {
  result: Resilience;
  stale: boolean;
  applied: { index: number } | null;
  onApply: (index: number) => void;
  onUndo: () => void;
}) {
  const band = resilienceBand(result.score);
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <p>
          <span className="font-mono text-mono-stat">{result.score}</span>
          <span className="font-mono text-mono text-muted-foreground">/100</span>
          <span className="sr-only"> — higher means a chatbot could do more of it</span>
        </p>
        <Badge variant={band.tone}>{band.label}</Badge>
      </div>
      <p>{result.summary}</p>
      <ul className="grid list-disc gap-1 pl-5 text-small text-muted-foreground">
        {result.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {stale ? <p className="text-sm text-muted-foreground">The instructions changed since this check. Check again for a new score.</p> : null}

      <div className="grid gap-3">
        <h4 className="text-label">Three ways to make it harder to hand off</h4>
        {result.rewrites.map((w, i) => (
          <div key={w.approach} className="grid gap-2 rounded-md border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-eyebrow text-muted-foreground">{approachLabels[w.approach]}</p>
                <p className="text-label">{w.title}</p>
              </div>
              {applied?.index === i ? (
                <Button type="button" variant="ghost" size="sm" onClick={onUndo}>
                  <Undo2 aria-hidden="true" />
                  Undo
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => onApply(i)}>
                  Use this version
                </Button>
              )}
            </div>
            <p className="text-small text-muted-foreground">{w.why}</p>
            <details>
              <summary className="min-h-11 cursor-pointer content-center text-small text-primary">Read the rewrite</summary>
              <p className="mt-1 whitespace-pre-line text-small">{w.instructions}</p>
            </details>
            {applied?.index === i ? (
              <p role="status" className="text-small">
                Applied to the instructions above. Save the assignment to keep it.
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
