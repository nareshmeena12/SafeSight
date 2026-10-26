"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Copy, Eye, EyeOff, Play, Printer, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quizAsText, type QuizQuestion } from "@/lib/brief/schema";
import { formatDateTime } from "@/lib/teacher/dates";
import { cn } from "@/lib/utils";

const letters = ["A", "B", "C", "D"];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A clean sheet in its own window: questions first, answers on a separate page. */
function printSheet(title: string, questions: QuizQuestion[]) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return false;
  const items = questions
    .map(
      (q) =>
        `<li><p>${esc(q.question)}</p><ol type="A">${q.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ol></li>`,
    )
    .join("");
  const answers = questions.map((q, i) => `<li><strong>${i + 1}. ${letters[q.answer]}</strong> — ${esc(q.explanation)}</li>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:15px/1.6 Geist,Inter,Arial,sans-serif;color:#14161F;margin:32px}h1{font:400 26px/1.2 'Instrument Serif',Georgia,serif;margin:0 0 4px}
.meta{color:#555;margin:0 0 24px}ol.q>li{margin:0 0 20px;break-inside:avoid}ol.q>li>p{margin:0 0 6px;font-weight:600}
ol[type=A]{margin:0;padding-left:24px}.answers{break-before:page}.answers ul{list-style:none;padding:0}.answers li{margin:0 0 10px}
.name{margin:0 0 24px}</style></head><body>
<h1>${esc(title)}</h1><p class="meta">5 questions · about 5 minutes</p><p class="name">Roll number: ______________________</p>
<ol class="q">${items}</ol>
<section class="answers"><h1>Answers</h1><p class="meta">For the teacher</p><ul>${answers}</ul></section>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
  return true;
}

export type QuizRun = { id: string; code: string; createdAt: string; open: boolean };

/** The brief's 5-question quiz: read it, print it, or run it live with a code. */
export function QuizPanel({
  briefId,
  title,
  questions,
  misconceptions,
  runs,
  canRun,
}: {
  briefId: string;
  title: string;
  questions: QuizQuestion[];
  misconceptions: string[];
  runs: QuizRun[];
  canRun: boolean;
}) {
  const router = useRouter();
  const [showAnswers, setShowAnswers] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const running = runs.find((r) => r.open);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/brief/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "The quiz didn't start. Please try again.");
      router.push(`/teacher/brief/quiz/${body.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The quiz didn't start.");
      setStarting(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(quizAsText(title, questions, true));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copying didn't work in this browser. Use Print instead.");
    }
  }

  return (
    <section aria-labelledby="quiz-heading" className="grid gap-4 rounded-lg border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="quiz-heading" className="text-title">
            5-question quiz
          </h2>
          <p className="text-small text-muted-foreground">
            For the start of class: on paper, or live on students&apos; phones with a code.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRun ? (
            running ? (
              <Button asChild>
                <Link href={`/teacher/brief/quiz/${running.id}`}>
                  <Radio aria-hidden="true" />
                  Live now · {running.code}
                </Link>
              </Button>
            ) : (
              <Button type="button" onClick={start} disabled={starting}>
                <Play aria-hidden="true" />
                {starting ? "Starting…" : "Run live"}
              </Button>
            )
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!printSheet(title, questions)) setError("Your browser blocked the print window. Allow pop-ups for this site.");
            }}
          >
            <Printer aria-hidden="true" />
            Print
          </Button>
          <Button type="button" variant="ghost" onClick={copy}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-small text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div>
        <Button type="button" variant="outline" size="sm" aria-pressed={showAnswers} onClick={() => setShowAnswers((v) => !v)}>
          {showAnswers ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          {showAnswers ? "Hide answers" : "Show answers"}
        </Button>
      </div>

      <ol className="grid gap-4">
        {questions.map((q, i) => (
          <li key={i} className="grid gap-2 rounded-md border p-4">
            <p className="flex gap-2">
              <span className="font-mono text-mono text-muted-foreground">{i + 1}</span>
              <span className="min-w-0">{q.question}</span>
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {q.options.map((o, j) => {
                const right = showAnswers && j === q.answer;
                return (
                  <li
                    key={j}
                    className={cn(
                      "flex min-w-0 items-start gap-2 rounded-sm border px-3 py-2 text-small",
                      right && "border-good bg-good/10",
                    )}
                  >
                    <span className="font-mono text-mono text-muted-foreground">{letters[j]}</span>
                    <span className="min-w-0 break-words">{o}</span>
                    {right ? <Check className="ml-auto size-4 shrink-0 text-good" strokeWidth={1.5} aria-label="Correct" /> : null}
                  </li>
                );
              })}
            </ul>
            {showAnswers ? <p className="text-small text-muted-foreground">{q.explanation}</p> : null}
            {misconceptions[q.misconception] ? (
              <p className="text-small text-muted-foreground">Checks: {misconceptions[q.misconception]}</p>
            ) : null}
          </li>
        ))}
      </ol>

      {runs.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-label">Live runs</h3>
          <ul className="grid gap-1">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/teacher/brief/quiz/${r.id}`}
                  className="inline-flex min-h-11 items-center gap-2 text-small text-primary underline-offset-4 hover:underline"
                >
                  {formatDateTime(r.createdAt)} · code <span className="font-mono text-mono">{r.code}</span>
                  {r.open ? " · live" : " · results"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
