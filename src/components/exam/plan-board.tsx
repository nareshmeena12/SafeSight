"use client";

import { BookOpenText, Check, ChevronDown, Layers, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { MasteryBadge, MasteryBar } from "@/components/learning/mastery";
import { PracticeButton } from "@/components/learning/practice-button";
import { Button } from "@/components/ui/button";
import { currentDay, missedTasks, planProgress, type PlanDay, type PlanTask, type PlanTopic } from "@/lib/exam/plan";
import { cn } from "@/lib/utils";
import { StartMockButton } from "./start-mock-button";

const dayFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

const dayKindLabel = { study: "", light: "Light day", mock: "Mock test day" } as const;

/**
 * The plan itself: today's tasks, catch-up, the topic checklist with mastery,
 * and every day up to the exam. Ticks save as you go (one request at a time,
 * so two quick ticks can't overwrite each other).
 */
export function PlanBoard({
  planId,
  courseId,
  today,
  days,
  topics,
  initialDone,
  initialChecked,
  mockSize,
}: {
  planId: string;
  courseId: string;
  today: string;
  days: PlanDay[];
  topics: PlanTopic[];
  initialDone: string[];
  initialChecked: string[];
  mockSize: "short" | "full";
}) {
  const [done, setDone] = useState(new Set(initialDone));
  const [checked, setChecked] = useState(new Set(initialChecked));
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  function save(body: object, undo: () => void) {
    queue.current = queue.current.then(async () => {
      try {
        const res = await fetch(`/api/exam/plans/${planId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error);
        setError(null);
      } catch (e) {
        undo();
        setError(e instanceof Error && e.message ? e.message : "That tick didn't save. Please try again.");
      }
    });
  }

  function toggleTask(id: string) {
    const next = !done.has(id);
    const flip = (on: boolean) =>
      setDone((s) => {
        const n = new Set(s);
        if (on) n.add(id);
        else n.delete(id);
        return n;
      });
    flip(next);
    save({ taskId: id, done: next }, () => flip(!next));
  }

  function toggleTopic(key: string) {
    const next = !checked.has(key);
    const flip = (on: boolean) =>
      setChecked((s) => {
        const n = new Set(s);
        if (on) n.add(key);
        else n.delete(key);
        return n;
      });
    flip(next);
    save({ topicKey: key, checked: next }, () => flip(!next));
  }

  const progress = planProgress(days, [...done]);
  const day = currentDay(days, today);
  const missed = missedTasks(days, [...done], today);
  const topicByKey = new Map(topics.map((t) => [t.key, t]));
  const row = (task: PlanTask) => (
    <TaskRow
      key={task.id}
      task={task}
      done={done.has(task.id)}
      onToggle={() => toggleTask(task.id)}
      topic={task.key ? topicByKey.get(task.key) : undefined}
      courseId={courseId}
      planId={planId}
      mockSize={mockSize}
    />
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:gap-8">
      <section aria-labelledby="progress-title" className="rounded-lg border bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="progress-title" className="text-title">
            Your progress
          </h2>
          <p className="text-small text-muted-foreground">
            <span className="font-mono text-foreground">{progress.done}</span> of <span className="font-mono text-foreground">{progress.total}</span> tasks ·{" "}
            <span className="font-mono text-foreground">{Math.round(progress.minutesDone / 6) / 10}</span> of{" "}
            <span className="font-mono text-foreground">{Math.round(progress.minutesTotal / 6) / 10}</span> hours
          </p>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border-strong/40" aria-hidden="true">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progress.total ? Math.max(2, Math.round((progress.done / progress.total) * 100)) : 0}%` }}
          />
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-small text-muted-foreground">
            {error}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6 lg:col-span-7">
          <section aria-labelledby="today-title" className="rounded-lg border bg-surface p-4 sm:p-6">
            <h2 id="today-title" className="text-title">
              {day ? (day.date === today ? "Today" : `Next: ${formatDay(day.date)}`) : "All done"}
              {day && dayKindLabel[day.kind] ? <span className="text-small font-normal text-muted-foreground"> · {dayKindLabel[day.kind]}</span> : null}
            </h2>
            {day ? (
              <>
                <p className="text-small text-muted-foreground">
                  About <span className="font-mono text-foreground">{day.tasks.reduce((a, t) => a + t.minutes, 0)}</span> minutes. Tick each one off when you&apos;re done.
                </p>
                <ul className="mt-4 grid gap-3">{day.tasks.map(row)}</ul>
              </>
            ) : (
              <p className="mt-1 text-small text-muted-foreground">Every day of the plan is behind you. All the best for the exam!</p>
            )}
          </section>

          {missed.length ? (
            <details className="group rounded-lg border bg-surface p-4 sm:p-6">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
                <span>
                  <span className="text-title">Catch up</span>
                  <span className="block text-small text-muted-foreground">
                    <span className="font-mono text-foreground">{missed.length}</span> {missed.length === 1 ? "task" : "tasks"} from earlier days. No stress — pick the ones that matter most.
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 transition-transform duration-150 ease-out group-open:rotate-180" strokeWidth={1.5} aria-hidden="true" />
              </summary>
              <ul className="mt-4 grid gap-3">{missed.slice(0, 8).map(row)}</ul>
            </details>
          ) : null}

          <section aria-labelledby="days-title">
            <h2 id="days-title" className="mb-4 text-title">
              Day by day
            </h2>
            <ol className="grid grid-cols-1 gap-2">
              {days.map((d) => {
                const finished = d.tasks.length > 0 && d.tasks.every((t) => done.has(t.id));
                return (
                  <li key={d.date}>
                    <details className="group rounded-lg border bg-surface" open={d.date === day?.date}>
                      <summary
                        className={cn(
                          "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2",
                          d.date < today && "text-muted-foreground",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {finished ? <Check className="size-4 shrink-0 text-good" strokeWidth={1.5} aria-label="Done" /> : null}
                          <span className="font-mono">{formatDay(d.date)}</span>
                          <span className="truncate text-small text-muted-foreground">
                            {dayKindLabel[d.kind] || d.tasks.map((t) => t.topic).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).slice(0, 2).join(", ")}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-small text-muted-foreground">
                          <span className="font-mono">{d.tasks.reduce((a, t) => a + t.minutes, 0)} min</span>
                          <ChevronDown className="size-4 transition-transform duration-150 ease-out group-open:rotate-180" strokeWidth={1.5} aria-hidden="true" />
                        </span>
                      </summary>
                      <ul className="grid gap-3 border-t p-4">{d.tasks.map(row)}</ul>
                    </details>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <section aria-labelledby="topics-title" className="min-w-0 rounded-lg border bg-surface p-4 sm:p-6 lg:col-span-5 lg:self-start">
          <h2 id="topics-title" className="text-title">
            Topic checklist
          </h2>
          <p className="text-small text-muted-foreground">Weakest first. Tick a topic once you feel ready on it; mastery moves with practice and mock tests.</p>
          <ul className="mt-4 divide-y">
            {topics.map((t) => (
              <li key={t.key} className="grid gap-2 py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <label className="-m-2.5 grid size-11 shrink-0 cursor-pointer place-items-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--ss-primary)]"
                      checked={checked.has(t.key)}
                      onChange={() => toggleTopic(t.key)}
                      aria-label={`I've revised ${t.title}`}
                    />
                  </label>
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className={cn("min-w-0", checked.has(t.key) && "text-muted-foreground line-through decoration-1")}>
                        {t.title}
                        {t.unit ? <span className="text-small text-muted-foreground"> · {t.unit}</span> : null}
                      </span>
                      {t.mastery !== null ? <MasteryBadge mastery={t.mastery} /> : <span className="text-small text-muted-foreground">Not practised yet</span>}
                    </div>
                    {t.mastery !== null ? <MasteryBar mastery={t.mastery} /> : null}
                    <p className="text-small text-muted-foreground">{t.reasons.slice(1).join(" · ")}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.notes[0] ? <NotesLink note={t.notes[0]} /> : null}
                      <PracticeButton courseId={courseId} topic={t.title} label="Practise" size="sm" variant="ghost" />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function NotesLink({ note }: { note: PlanTopic["notes"][number] }) {
  return (
    <a
      href={`/api/materials/${note.materialId}/file${note.page ? `?page=${note.page}` : ""}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 text-small text-primary hover:bg-hover"
    >
      <BookOpenText className="size-4" strokeWidth={1.5} aria-hidden="true" />
      <span className="max-w-48 truncate">{note.title}</span>
      {note.page ? <span className="font-mono">p. {note.page}</span> : null}
    </a>
  );
}

function TaskRow({
  task,
  done,
  onToggle,
  topic,
  courseId,
  planId,
  mockSize,
}: {
  task: PlanTask;
  done: boolean;
  onToggle: () => void;
  topic?: PlanTopic;
  courseId: string;
  planId: string;
  mockSize: "short" | "full";
}) {
  let action: React.ReactNode = null;
  if (task.kind === "learn") {
    action = (
      <>
        {topic?.notes[0] ? <NotesLink note={topic.notes[0]} /> : null}
        <Button asChild variant="ghost" size="sm">
          <Link href={`/student/sage?course=${courseId}`}>
            <MessagesSquare aria-hidden="true" />
            Ask Sage
          </Link>
        </Button>
      </>
    );
  } else if ((task.kind === "practice" || task.kind === "revisit") && task.topic) {
    action = <PracticeButton courseId={courseId} topic={task.topic} label="Practise" size="sm" variant="ghost" />;
  } else if (task.kind === "review") {
    action = <PracticeButton courseId={courseId} topic="Review before exam" kind="review" label="Start review" size="sm" variant="ghost" />;
  } else if (task.kind === "recap") {
    action = (
      <Button asChild variant="ghost" size="sm">
        <Link href="/student/learning#recaps">
          <Layers aria-hidden="true" />
          Open flashcards
        </Link>
      </Button>
    );
  } else if (task.kind === "mock") {
    action = <StartMockButton planId={planId} size={mockSize} label="Start mock test" sizeVariant="sm" />;
  }
  return (
    <li className="flex items-start gap-3">
      <label className="-m-2.5 grid size-11 shrink-0 cursor-pointer place-items-center">
        <input type="checkbox" className="size-4 accent-[var(--ss-primary)]" checked={done} onChange={onToggle} aria-label={`Done: ${task.title}`} />
      </label>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className={cn("min-w-0 break-words", done && "text-muted-foreground line-through decoration-1")}>
          {task.title} <span className="font-mono text-small text-muted-foreground">· {task.minutes} min</span>
        </p>
        {action && !done ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </li>
  );
}
