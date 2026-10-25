"use client";

import { Check, ChevronDown, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Markdown } from "@/components/sage/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MasteryBadge } from "./mastery";
import { PracticeButton } from "./practice-button";

export type RunnerItem = {
  id: string;
  position: number;
  difficulty: "warm_up" | "standard" | "stretch" | "check";
  format: "open" | "choice";
  question: string;
  options: string[] | null;
  topic: string | null;
  answer: string | null;
  choice: number | null;
  score: number | null;
  verdict: "correct" | "partly" | "not_yet" | null;
  feedback: string | null;
  solution: string | null;
};

const difficultyLabel = { warm_up: "Warm-up", standard: "Standard", stretch: "Stretch", check: "Quick check" } as const;
const verdictText = { correct: "Correct", partly: "Partly there", not_yet: "Not yet" } as const;
const verdictDot = { correct: "bg-good", partly: "bg-warning", not_yet: "bg-critical" } as const;

/** One practice, review or refresher set: answer each item in turn, with feedback and the worked solution after. */
export function PracticeRunner({
  setId,
  kind,
  courseId,
  topic,
  initialItems,
  initialScore,
  initialMastery,
}: {
  setId: string;
  kind: "practice" | "review" | "refresher";
  courseId: string;
  topic: string;
  initialItems: RunnerItem[];
  initialScore: number | null;
  initialMastery: number | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [done, setDone] = useState<{ score: number | null; mastery: number | null } | null>(
    initialItems.every((i) => i.verdict) ? { score: initialScore, mastery: initialMastery } : null,
  );
  const current = items.find((i) => !i.verdict)?.id ?? null;

  function onAnswered(updated: RunnerItem, set: { completed: boolean; score: number | null; mastery: { mastery: number } | null }) {
    setItems((list) => list.map((i) => (i.id === updated.id ? updated : i)));
    if (set.completed) setDone({ score: set.score, mastery: set.mastery?.mastery ?? null });
  }

  return (
    <div className="grid gap-4">
      <ol className="grid gap-4">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard item={item} setId={setId} active={item.id === current} locked={!item.verdict && item.id !== current} onAnswered={onAnswered} />
          </li>
        ))}
      </ol>
      {done ? (
        <section aria-labelledby="practice-done" className="rounded-lg border bg-surface p-6" aria-live="polite">
          <h2 id="practice-done" className="text-title">
            {kind === "refresher" ? "Refresher done" : "Set done"}
          </h2>
          <p className="mt-1 text-small text-muted-foreground">
            You scored <span className="font-mono text-foreground">{Math.round((done.score ?? 0) * 100)}%</span>
            {kind === "review" ? " on your review." : ` on ${topic}.`} It&apos;s saved in My learning.
          </p>
          {done.mastery !== null ? (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-small text-muted-foreground">
              Mastery now <MasteryBadge mastery={done.mastery} />
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/student/learning">Back to My learning</Link>
            </Button>
            {kind !== "review" ? <PracticeButton courseId={courseId} topic={topic} label="Practise again" /> : null}
            <Button asChild variant="ghost">
              <Link href={`/student/sage?course=${courseId}`}>Ask Sage about it</Link>
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ItemCard({
  item,
  setId,
  active,
  locked,
  onAnswered,
}: {
  item: RunnerItem;
  setId: string;
  active: boolean;
  locked: boolean;
  onAnswered: (item: RunnerItem, set: { completed: boolean; score: number | null; mastery: { mastery: number } | null }) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const label = `${item.format === "choice" ? "Check" : "Problem"} ${item.position}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (item.format === "open" && !answer.trim()) return setError("Write your answer first — your steps help Sage give better feedback.");
    if (item.format === "choice" && choice === null) return setError("Pick an option first.");
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/learning/practice/${setId}/items/${item.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item.format === "open" ? { answer } : { choice }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        item?: { score: number; verdict: RunnerItem["verdict"]; feedback: string; solution: string };
        set?: { completed: boolean; score: number | null; mastery: { mastery: number } | null };
      } | null;
      if (!res.ok || !body?.item || !body.set) throw new Error(body?.error ?? "Sage couldn't check this just now. Please try again.");
      onAnswered(
        { ...item, answer: item.format === "open" ? answer : null, choice, ...body.item },
        body.set,
      );
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Sage couldn't check this just now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article
      aria-labelledby={`${item.id}-title`}
      className={cn("rounded-lg border bg-surface p-4 sm:p-6", locked && "opacity-70")}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${item.id}-title`} className="text-label">
          {label} <span className="font-normal text-muted-foreground">· {difficultyLabel[item.difficulty]}</span>
          {item.topic ? <span className="font-normal text-muted-foreground"> · {item.topic}</span> : null}
        </h2>
        {item.verdict ? (
          <span className="inline-flex items-center gap-1.5 text-small">
            <span aria-hidden="true" className={cn("size-1.5 rounded-full", verdictDot[item.verdict])} />
            {verdictText[item.verdict]}
            <span className="font-mono text-muted-foreground">{Math.round((item.score ?? 0) * 100)}%</span>
          </span>
        ) : null}
      </header>

      {locked ? (
        <p className="mt-3 flex items-center gap-2 text-small text-muted-foreground">
          <Lock className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          Opens when you&apos;ve answered the one above.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <Markdown>{item.question}</Markdown>
          </div>

          {item.verdict ? (
            <div className="mt-4 grid gap-3">
              {item.format === "open" && item.answer ? (
                <div className="rounded-md bg-primary-soft/50 px-4 py-3 text-small">
                  <p className="mb-1 text-muted-foreground">Your answer</p>
                  <p className="whitespace-pre-wrap break-words">{item.answer}</p>
                </div>
              ) : null}
              {item.format === "choice" && item.options ? (
                <ChoiceList options={item.options} value={item.choice} disabled name={item.id} />
              ) : null}
              {item.feedback ? (
                <div className="text-small">
                  <Markdown>{item.feedback}</Markdown>
                </div>
              ) : null}
              {item.solution && item.format === "open" ? (
                <div className="rounded-md border">
                  <button
                    type="button"
                    onClick={() => setShowSolution((s) => !s)}
                    aria-expanded={showSolution}
                    className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-label"
                  >
                    Worked solution
                    <ChevronDown
                      className={cn("size-4 transition-transform duration-150 ease-out", showSolution && "rotate-180")}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </button>
                  {showSolution ? (
                    <div className="border-t px-4 py-3 text-small">
                      <Markdown>{item.solution}</Markdown>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : active ? (
            <form onSubmit={submit} className="mt-4 grid gap-3">
              {item.format === "choice" && item.options ? (
                <ChoiceList options={item.options} value={choice} onChange={setChoice} name={item.id} />
              ) : (
                <>
                  <label htmlFor={`${item.id}-answer`} className="text-small text-muted-foreground">
                    Your answer — show your steps and units
                  </label>
                  <Textarea
                    id={`${item.id}-answer`}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    maxLength={4000}
                    rows={4}
                    className="min-h-28"
                  />
                </>
              )}
              {error ? (
                <p role="alert" className="text-small text-muted-foreground">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={pending} className="justify-self-start">
                {pending ? "Checking…" : "Check my answer"}
              </Button>
            </form>
          ) : null}
        </>
      )}
    </article>
  );
}

function ChoiceList({
  options,
  value,
  onChange,
  disabled = false,
  name,
}: {
  options: string[];
  value: number | null;
  onChange?: (n: number) => void;
  disabled?: boolean;
  name: string;
}) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="sr-only">Options</legend>
      {options.map((o, i) => (
        <label
          key={`${i}-${o}`}
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-4 py-2 text-small transition-colors duration-150 ease-out hover:border-border-strong",
            value === i && "border-primary bg-primary-soft/60",
            disabled && "cursor-default",
          )}
        >
          <input type="radio" name={name} className="accent-[var(--ss-primary)]" checked={value === i} onChange={() => onChange?.(i)} />
          <span className="min-w-0 flex-1">
            <Markdown>{o}</Markdown>
          </span>
          {disabled && value === i ? <Check className="size-4 text-primary" strokeWidth={1.5} aria-hidden="true" /> : null}
        </label>
      ))}
    </fieldset>
  );
}
