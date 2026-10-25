"use client";

import { useState } from "react";
import { Check, CircleAlert, Copy, MessageCircleQuestion, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { vivaAsText, type VivaEvidence, type VivaQuestion } from "@/lib/lens/viva-schema";
import { cn } from "@/lib/utils";

/**
 * "Suggest viva questions" on a submission replay (S18): Lens suggests three
 * questions about the student's own work, with what a good answer shows. The
 * teacher copies them or marks each one discussed.
 */
export function VivaQuestions({
  submissionId,
  title,
  initial,
  evidence,
  configured,
  canEdit,
}: {
  submissionId: string;
  title: string;
  initial: VivaQuestion[] | null;
  evidence: VivaEvidence;
  configured: boolean;
  canEdit: boolean;
}) {
  const [questions, setQuestions] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function suggest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lens/viva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Lens couldn't suggest questions just now. Please try again.");
      setQuestions(body.questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lens couldn't suggest questions just now.");
    } finally {
      setLoading(false);
    }
  }

  async function mark(index: number, discussed: boolean) {
    const before = questions;
    setQuestions((qs) => qs?.map((q, i) => (i === index ? { ...q, discussedAt: discussed ? new Date().toISOString() : null } : q)) ?? null);
    setError(null);
    const res = await fetch("/api/lens/viva", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, index, discussed }),
    }).catch(() => null);
    if (!res?.ok) {
      setQuestions(before);
      setError("That didn't save. Please try again.");
    }
  }

  async function copy() {
    if (!questions) return;
    try {
      await navigator.clipboard.writeText(vivaAsText(title, questions));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copying didn't work in this browser. Select the text instead.");
    }
  }

  const discussed = questions?.filter((q) => q.discussedAt).length ?? 0;

  return (
    <section aria-labelledby="viva-heading" className="grid gap-4 rounded-lg border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <MessageCircleQuestion className="mt-1 size-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
          <div>
            <h2 id="viva-heading" className="text-title">
              Viva questions
            </h2>
            <p className="text-small text-muted-foreground">
              {evidence.strong
                ? `In this work, ${evidence.reasons.join("; ")}. A short conversation lets the student explain it in their own words.`
                : "Three questions about this work, for a short conversation in the student's own words."}
            </p>
          </div>
        </div>
        {questions ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            {canEdit && configured ? (
              <Button type="button" variant="ghost" onClick={suggest} disabled={loading}>
                <RefreshCw aria-hidden="true" />
                {loading ? "Thinking…" : "New questions"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div aria-live="polite" className="grid gap-3">
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-small text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {loading && !questions ? (
          <div className="grid gap-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : null}

        {questions ? (
          <>
            <ol className="grid gap-3">
              {questions.map((q, i) => {
                const done = Boolean(q.discussedAt);
                return (
                  <li key={i} className={cn("grid gap-2 rounded-md border p-4 sm:grid-cols-[1fr_auto] sm:items-start", done && "bg-hover")}>
                    <div className="grid gap-1">
                      <p>
                        <span className="mr-2 font-mono text-mono text-muted-foreground">{i + 1}</span>
                        {q.question}
                      </p>
                      <p className="text-small text-muted-foreground">
                        <span className="text-foreground">A good answer shows: </span>
                        {q.lookFor}
                      </p>
                    </div>
                    {canEdit ? (
                      <Button
                        type="button"
                        variant={done ? "secondary" : "outline"}
                        size="sm"
                        aria-pressed={done}
                        onClick={() => mark(i, !done)}
                      >
                        <Check aria-hidden="true" className={done ? undefined : "opacity-40"} />
                        {done ? "Discussed" : "Mark discussed"}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <p className="text-small text-muted-foreground">
              <span className="font-mono text-mono">{discussed}</span> of 3 discussed. Only you see these questions.
            </p>
          </>
        ) : !loading ? (
          !configured ? (
            <p className="text-muted-foreground">Lens isn&apos;t connected to its AI model yet, so it can&apos;t suggest questions here.</p>
          ) : canEdit ? (
            <div>
              <Button type="button" variant={evidence.strong ? "default" : "outline"} onClick={suggest}>
                <MessageCircleQuestion aria-hidden="true" />
                Suggest viva questions
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">No questions yet. The course teacher can ask Lens for some.</p>
          )
        ) : null}
      </div>
    </section>
  );
}
