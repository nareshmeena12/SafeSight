"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitQuizAnswer } from "@/lib/brief/actions";
import type { StudentQuizView } from "@/lib/brief/quiz";
import { cn } from "@/lib/utils";

const letters = ["A", "B", "C", "D"];

/** The quiz on a student's phone: one question at a time while open, then the answers once the teacher closes it. */
export function StudentQuiz({ view }: { view: StudentQuizView }) {
  const router = useRouter();
  const [mine, setMine] = useState(view.mine);
  const [index, setIndex] = useState(() => {
    const first = view.mine.findIndex((m) => m === null);
    return first === -1 ? view.questions.length : first;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = index >= view.questions.length;

  // Waiting for the teacher to close the quiz: check now and then.
  useEffect(() => {
    if (!view.open || !done) return;
    const timer = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(timer);
  }, [view.open, done, router]);

  if (!view.open) {
    const right = view.questions.filter((q, i) => mine[i] !== null && mine[i] === q.answer).length;
    return (
      <div className="grid gap-4">
        <p className="rounded-lg bg-primary-soft p-4">
          You got <span className="font-mono text-mono">{right}</span> of {view.questions.length}. Read the explanations for any you
          missed; they&apos;re the ideas your class found tricky this week.
        </p>
        <ol className="grid gap-3">
          {view.questions.map((q, i) => (
            <li key={i} className="grid gap-2 rounded-lg border bg-surface p-4">
              <p className="flex gap-2">
                <span className="font-mono text-mono text-muted-foreground">{i + 1}</span>
                <span className="min-w-0">{q.question}</span>
              </p>
              <ul className="grid gap-1.5">
                {q.options.map((o, j) => {
                  const isAnswer = j === q.answer;
                  const picked = mine[i] === j;
                  return (
                    <li
                      key={j}
                      className={cn(
                        "flex items-start gap-2 rounded-sm border px-3 py-2 text-small",
                        isAnswer && "border-good bg-good/10",
                        picked && !isAnswer && "border-critical",
                      )}
                    >
                      <span className="font-mono text-mono text-muted-foreground">{letters[j]}</span>
                      <span className="min-w-0 flex-1 break-words">{o}</span>
                      {isAnswer ? <Check className="size-4 shrink-0 text-good" strokeWidth={1.5} aria-label="Right answer" /> : null}
                      {picked && !isAnswer ? <X className="size-4 shrink-0 text-critical" strokeWidth={1.5} aria-label="Your answer" /> : null}
                      {picked && isAnswer ? <span className="sr-only">Your answer</span> : null}
                    </li>
                  );
                })}
              </ul>
              {q.explanation ? <p className="text-small text-muted-foreground">{q.explanation}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (done) {
    return (
      <div className="grid gap-4 rounded-lg border bg-surface p-6 text-center">
        <p className="text-title">All done</p>
        <p className="text-muted-foreground">
          Your answers are in. The right answers appear here when your teacher closes the quiz.
        </p>
        <div>
          <Button type="button" variant="outline" onClick={() => setIndex(0)}>
            <ArrowLeft aria-hidden="true" />
            Review my answers
          </Button>
        </div>
      </div>
    );
  }

  const q = view.questions[index];
  function choose(choice: number) {
    setError(null);
    start(async () => {
      const result = await submitQuizAnswer({ sessionId: view.id, index, choice });
      if (!result.ok) {
        setError(result.message);
        if ("closed" in result && result.closed) router.refresh();
        return;
      }
      setMine((m) => m.map((v, i) => (i === index ? choice : v)));
      setIndex((i) => i + 1);
    });
  }

  return (
    <section aria-labelledby="question-text" className="grid gap-4">
      <p className="text-small text-muted-foreground">
        Question <span className="font-mono text-mono">{index + 1}</span> of {view.questions.length}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-hover" aria-hidden="true">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${(index / view.questions.length) * 100}%` }} />
      </div>
      <p id="question-text" className="text-lead">
        {q.question}
      </p>
      <div role="radiogroup" aria-labelledby="question-text" className="grid gap-2">
        {q.options.map((o, j) => {
          const picked = mine[index] === j;
          return (
            <button
              key={j}
              type="button"
              role="radio"
              aria-checked={picked}
              disabled={pending}
              onClick={() => choose(j)}
              className={cn(
                "flex min-h-14 w-full items-start gap-3 rounded-md border bg-surface px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-hover disabled:opacity-60",
                picked && "border-primary bg-primary-soft",
              )}
            >
              <span className="font-mono text-mono text-muted-foreground">{letters[j]}</span>
              <span className="min-w-0 break-words">{o}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-small text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" disabled={index === 0 || pending} onClick={() => setIndex((i) => i - 1)}>
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
        {mine[index] !== null ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setIndex((i) => i + 1)}>
            Next
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </section>
  );
}
