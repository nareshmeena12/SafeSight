"use client";

import { Check, CloudOff, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/sage/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type MockItem = {
  id: string;
  position: number;
  kind: "conceptual" | "numeric";
  format: "choice" | "open";
  topic: string;
  question: string;
  options: string[] | null;
  marks: number;
  answer: string | null;
  choice: number | null;
};

type SaveState = "idle" | "saving" | "saved" | "failed";

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A running mock test: every question on one page like a paper, a countdown,
 * answers saved as you go, and "Hand in". When the time runs out the test is
 * handed in with whatever was saved.
 */
export function MockRunner({
  testId,
  endsAt,
  serverNow,
  items,
}: {
  testId: string;
  endsAt: string;
  /** The server's clock when the page rendered, so a wrong phone clock doesn't change the time left. */
  serverNow: number;
  items: MockItem[];
}) {
  const router = useRouter();
  const [skew] = useState(() => serverNow - Date.now());
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((Date.parse(endsAt) - serverNow) / 1000)));
  const [answers, setAnswers] = useState<Record<string, { answer: string; choice: number | null }>>(() =>
    Object.fromEntries(items.map((i) => [i.id, { answer: i.answer ?? "", choice: i.choice }])),
  );
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, Promise<void>>());
  const handedIn = useRef(false);
  // The latest answers for the hand-in (it runs from the timer too).
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const saveNow = useCallback(
    (id: string, body: { answer?: string; choice?: number | null }) => {
      setSaves((s) => ({ ...s, [id]: "saving" }));
      const run = (async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(`/api/exam/mock/${testId}/items/${id}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            });
            if (res.ok) {
              setSaves((s) => ({ ...s, [id]: "saved" }));
              return;
            }
            if (res.status === 409) break;
          } catch {
            // Network blip: one more try.
          }
        }
        setSaves((s) => ({ ...s, [id]: "failed" }));
      })();
      pending.current.set(id, run);
      return run;
    },
    [testId],
  );

  function setAnswer(id: string, answer: string) {
    setAnswers((a) => ({ ...a, [id]: { ...a[id], answer } }));
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        void saveNow(id, { answer });
      }, 1200),
    );
  }

  function setChoice(id: string, choice: number) {
    setAnswers((a) => ({ ...a, [id]: { ...a[id], choice } }));
    void saveNow(id, { choice });
  }

  const handIn = useCallback(async () => {
    if (handedIn.current) return;
    handedIn.current = true;
    setSubmitting(true);
    setError(null);
    // Save anything still typed but not sent.
    const latest = answersRef.current;
    for (const [id, t] of timers.current) {
      clearTimeout(t);
      void saveNow(id, { answer: latest[id]?.answer ?? "" });
    }
    timers.current.clear();
    await Promise.allSettled(pending.current.values());
    try {
      const res = await fetch(`/api/exam/mock/${testId}/submit`, { method: "POST" });
      if (!res.ok && res.status !== 409) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Sage couldn't mark your test just now. Your answers are saved — try again in a minute.");
      }
      router.refresh();
    } catch (e) {
      handedIn.current = false;
      setSubmitting(false);
      setError(e instanceof Error && e.message ? e.message : "Sage couldn't mark your test just now. Please try again.");
    }
  }, [router, saveNow, testId]);

  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.floor((Date.parse(endsAt) - (Date.now() + skew)) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(tick);
        void handIn();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [endsAt, skew, handIn]);

  // Leaving the page keeps the latest typing.
  useEffect(() => {
    const flush = () => {
      for (const [id, t] of timers.current) {
        clearTimeout(t);
        const blob = new Blob([JSON.stringify({ answer: answersRef.current[id]?.answer ?? "" })], { type: "application/json" });
        void fetch(`/api/exam/mock/${testId}/items/${id}`, { method: "PUT", body: blob, keepalive: true, headers: { "content-type": "application/json" } });
      }
      timers.current.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [testId]);

  const unanswered = items.filter((i) => (i.format === "choice" ? answers[i.id]?.choice === null || answers[i.id]?.choice === undefined : !answers[i.id]?.answer.trim())).length;
  const failed = Object.values(saves).some((s) => s === "failed");
  const low = left <= 60;

  return (
    <div className="grid gap-4">
      <div className="sticky top-16 z-10 -mx-4 border-y bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="flex items-center gap-2" aria-live="off">
            <Timer className={cn("size-4", low ? "text-critical" : "text-muted-foreground")} strokeWidth={1.5} aria-hidden="true" />
            <span className={cn("font-mono text-mono-stat leading-none", low && "text-critical")} role="timer" aria-label={`${Math.ceil(left / 60)} minutes left`}>
              {clock(left)}
            </span>
            <span className="text-small text-muted-foreground">left</span>
          </p>
          <p className="flex items-center gap-1.5 text-small text-muted-foreground" aria-live="polite">
            {failed ? (
              <>
                <CloudOff className="size-4" strokeWidth={1.5} aria-hidden="true" /> An answer didn&apos;t save — check your connection
              </>
            ) : (
              <>
                <span className="font-mono text-foreground">{items.length - unanswered}</span>/<span className="font-mono">{items.length}</span> answered · saved as you go
              </>
            )}
          </p>
        </div>
      </div>

      <ol className="grid gap-4">
        {items.map((item) => (
          <li key={item.id}>
            <article aria-labelledby={`${item.id}-title`} className="rounded-lg border bg-surface p-4 sm:p-6">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={`${item.id}-title`} className="text-label">
                  Question {item.position}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {item.kind === "numeric" ? "Numerical" : item.format === "choice" ? "Multiple choice" : "Short answer"}
                    {item.topic ? ` · ${item.topic}` : ""}
                  </span>
                </h2>
                <span className="flex items-center gap-2 text-small text-muted-foreground">
                  {saves[item.id] === "saved" ? <Check className="size-3.5 text-good" strokeWidth={1.5} aria-label="Saved" /> : null}
                  <span className="font-mono">
                    {item.marks} {item.marks === 1 ? "mark" : "marks"}
                  </span>
                </span>
              </header>
              <div className="mt-3">
                <Markdown>{item.question}</Markdown>
              </div>
              {item.format === "choice" && item.options ? (
                <fieldset className="mt-4 grid gap-2" disabled={submitting}>
                  <legend className="sr-only">Options for question {item.position}</legend>
                  {item.options.map((o, i) => (
                    <label
                      key={`${i}-${o}`}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-4 py-2 text-small transition-colors duration-150 ease-out hover:border-border-strong",
                        answers[item.id]?.choice === i && "border-primary bg-primary-soft/60",
                      )}
                    >
                      <input
                        type="radio"
                        name={item.id}
                        className="accent-[var(--ss-primary)]"
                        checked={answers[item.id]?.choice === i}
                        onChange={() => setChoice(item.id, i)}
                      />
                      <span className="min-w-0 flex-1">
                        <Markdown>{o}</Markdown>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <div className="mt-4 grid gap-2">
                  <label htmlFor={`${item.id}-answer`} className="text-small text-muted-foreground">
                    {item.kind === "numeric" ? "Your working and final answer, with units" : "Your answer, in a few sentences"}
                  </label>
                  <Textarea
                    id={`${item.id}-answer`}
                    value={answers[item.id]?.answer ?? ""}
                    onChange={(e) => setAnswer(item.id, e.target.value)}
                    onBlur={() => {
                      const t = timers.current.get(item.id);
                      if (t) {
                        clearTimeout(t);
                        timers.current.delete(item.id);
                        void saveNow(item.id, { answer: answers[item.id]?.answer ?? "" });
                      }
                    }}
                    maxLength={4000}
                    rows={item.kind === "numeric" ? 5 : 4}
                    className="min-h-28"
                    disabled={submitting}
                  />
                </div>
              )}
            </article>
          </li>
        ))}
      </ol>

      <section aria-label="Hand in" className="rounded-lg border bg-surface p-4 sm:p-6">
        {submitting ? (
          <p className="text-small text-muted-foreground" aria-live="polite">
            Handing in and marking your test… this takes a few seconds.
          </p>
        ) : confirming ? (
          <div className="grid gap-3">
            <p className="text-small">
              {unanswered ? (
                <>
                  You haven&apos;t answered <span className="font-mono">{unanswered}</span> {unanswered === 1 ? "question" : "questions"}. Hand in anyway?
                </>
              ) : (
                "Hand in your test? You can't change answers after this."
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => void handIn()}>
                Hand in now
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                Keep going
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-small text-muted-foreground">Done? Hand in to see your marks, feedback and worked solutions.</p>
            <Button type="button" onClick={() => setConfirming(true)}>
              Hand in
            </Button>
          </div>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-small text-muted-foreground">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
