import { Check, ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { MasteryBar } from "@/components/learning/mastery";
import { PracticeButton } from "@/components/learning/practice-button";
import { Markdown } from "@/components/sage/markdown";
import { Button } from "@/components/ui/button";
import { topicScores, type Verdict } from "@/lib/exam/grade";
import { cn } from "@/lib/utils";

type ResultItem = {
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
  score: number | null;
  verdict: string | null;
  feedback: string | null;
  solution: string | null;
};

const verdictText: Record<Verdict, string> = { correct: "Correct", partly: "Partly there", not_yet: "Not yet", unchecked: "Not checked" };
const verdictDot: Record<Verdict, string> = { correct: "bg-good", partly: "bg-warning", not_yet: "bg-critical", unchecked: "bg-border-strong" };

/** A marked mock test: the score, how each topic went, and every question with feedback and its worked solution. */
export function MockResults({
  test,
  items,
}: {
  test: { planId: string | null; courseId: string; marks: number | null; maxMarks: number | null; score: number | null };
  items: ResultItem[];
}) {
  const asVerdict = (v: string | null) => (v && v in verdictText ? (v as Verdict) : null);
  const byTopic = topicScores(items.map((i) => ({ topic: i.topic, marks: i.marks, score: i.score, verdict: asVerdict(i.verdict) }))).sort((a, b) => a.score - b.score);
  const unchecked = items.filter((i) => i.verdict === "unchecked").length;
  const weakest = byTopic[0];

  return (
    <div className="grid gap-4">
      <section aria-labelledby="result-title" className="rounded-lg border bg-surface p-4 sm:p-6">
        <h2 id="result-title" className="text-title">
          Your result
        </h2>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-mono-stat">{test.score !== null ? `${Math.round(test.score * 100)}%` : "—"}</span>
          <span className="text-small text-muted-foreground">
            <span className="font-mono text-foreground">{test.marks ?? 0}</span> of <span className="font-mono">{test.maxMarks ?? 0}</span> marks
            {unchecked ? ` · ${unchecked} not checked, left out of the total` : ""}
          </span>
        </p>
        <p className="mt-1 text-small text-muted-foreground">Saved to your mastery per topic. Your teacher doesn&apos;t see this test.</p>
        {byTopic.length ? (
          <ul className="mt-6 grid gap-3">
            {byTopic.map((t) => (
              <li key={t.topic} className="grid gap-1.5">
                <span className="flex items-baseline justify-between gap-3 text-small">
                  <span className="min-w-0">{t.topic}</span>
                  <span className="font-mono">{Math.round(t.score * 100)}%</span>
                </span>
                <MasteryBar mastery={t.score} />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {weakest && weakest.score < 0.75 ? <PracticeButton courseId={test.courseId} topic={weakest.topic} label={`Practise ${weakest.topic}`} /> : null}
          <Button asChild variant="ghost">
            <Link href={test.planId ? `/student/exam/${test.planId}` : "/student/exam"}>Back to your plan</Link>
          </Button>
        </div>
      </section>

      <ol className="grid gap-4">
        {items.map((item) => {
          const verdict = asVerdict(item.verdict);
          return (
            <li key={item.id}>
              <article aria-labelledby={`${item.id}-title`} className="rounded-lg border bg-surface p-4 sm:p-6">
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id={`${item.id}-title`} className="text-label">
                    Question {item.position}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {item.kind === "numeric" ? "Numerical" : item.format === "choice" ? "Multiple choice" : "Short answer"}
                      {item.topic ? ` · ${item.topic}` : ""}
                    </span>
                  </h3>
                  {verdict ? (
                    <span className="inline-flex items-center gap-1.5 text-small">
                      <span aria-hidden="true" className={cn("size-1.5 rounded-full", verdictDot[verdict])} />
                      {verdictText[verdict]}
                      {verdict !== "unchecked" ? (
                        <span className="font-mono text-muted-foreground">
                          {Math.round((item.score ?? 0) * item.marks * 10) / 10}/{item.marks}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </header>
                <div className="mt-3">
                  <Markdown>{item.question}</Markdown>
                </div>
                {item.format === "choice" && item.options ? (
                  <ul className="mt-4 grid gap-2" aria-label="Options">
                    {item.options.map((o, i) => {
                      const picked = item.choice === i;
                      return (
                        <li
                          key={`${i}-${o}`}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-md border px-4 py-2 text-small",
                            picked && (verdict === "correct" ? "border-good" : "border-critical"),
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <Markdown>{o}</Markdown>
                          </span>
                          {picked ? (
                            verdict === "correct" ? (
                              <Check className="size-4 text-good" strokeWidth={1.5} aria-label="Your answer, correct" />
                            ) : (
                              <X className="size-4 text-critical" strokeWidth={1.5} aria-label="Your answer" />
                            )
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="mt-4 rounded-md bg-primary-soft/50 px-4 py-3 text-small">
                    <p className="mb-1 text-muted-foreground">Your answer</p>
                    <p className="break-words whitespace-pre-wrap">{item.answer?.trim() || "Left blank"}</p>
                  </div>
                )}
                {item.feedback ? (
                  <div className="mt-3 text-small">
                    <Markdown>{item.feedback}</Markdown>
                  </div>
                ) : null}
                {item.solution ? (
                  <details className="group mt-3 rounded-md border">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-label">
                      {item.format === "choice" ? "Why" : "Worked solution"}
                      <ChevronDown className="size-4 transition-transform duration-150 ease-out group-open:rotate-180" strokeWidth={1.5} aria-hidden="true" />
                    </summary>
                    <div className="border-t px-4 py-3 text-small">
                      <Markdown>{item.solution}</Markdown>
                    </div>
                  </details>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
