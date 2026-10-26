import { ArrowRight, CalendarRange } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { countdownLabel, currentDay, daysBetween, planProgress, type PlanDay } from "@/lib/exam/plan";

export type CountdownPlan = { id: string; course: string; examDate: string; days: PlanDay[]; done: string[] };

/**
 * "Exam in N days" on the student's home: the nearest exam's countdown,
 * today's tasks and progress, and any other upcoming exams in one line each.
 * Without a plan, a quiet invitation to make one.
 */
export function ExamCountdownCard({ plans, today }: { plans: CountdownPlan[]; today: string }) {
  if (!plans.length) {
    return (
      <Link
        href="/student/exam"
        className="mb-6 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-dashed bg-surface/60 px-4 py-3 text-small text-muted-foreground transition-colors duration-150 ease-out hover:border-border-strong hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <CalendarRange className="size-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
          Exam coming up? Make a day-by-day revision plan.
        </span>
        <ArrowRight className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      </Link>
    );
  }
  const [next, ...others] = plans;
  const left = daysBetween(today, next.examDate);
  const day = currentDay(next.days, today);
  const tasks = day && day.date === today ? day.tasks.filter((t) => !next.done.includes(t.id)) : [];
  const progress = planProgress(next.days, next.done);

  return (
    <section aria-labelledby="exam-countdown" className="mb-6 rounded-lg border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-eyebrow text-muted-foreground uppercase">{next.course}</p>
          <h2 id="exam-countdown" className="mt-1 font-serif text-headline-sm">
            {countdownLabel(left)}
          </h2>
          <p className="mt-1 text-small text-muted-foreground">
            <span className="font-mono text-foreground">{progress.done}</span>/<span className="font-mono">{progress.total}</span> revision tasks done
          </p>
        </div>
        <Button asChild>
          <Link href={`/student/exam/${next.id}`}>
            Open plan
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      {day && day.date === today ? (
        tasks.length ? (
          <div className="mt-4 border-t pt-4">
            <p className="text-label">Today</p>
            <ul className="mt-2 grid gap-1 text-small">
              {tasks.slice(0, 3).map((t) => (
                <li key={t.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">{t.title}</span>
                  <span className="shrink-0 font-mono text-muted-foreground">{t.minutes} min</span>
                </li>
              ))}
            </ul>
            {tasks.length > 3 ? <p className="mt-1 text-small text-muted-foreground">and {tasks.length - 3} more</p> : null}
          </div>
        ) : (
          <p className="mt-4 border-t pt-4 text-small text-muted-foreground">Today&apos;s revision is done. Nicely done — rest up.</p>
        )
      ) : null}
      {others.length ? (
        <ul className="mt-4 grid gap-1 border-t pt-4 text-small">
          {others.map((p) => (
            <li key={p.id}>
              <Link href={`/student/exam/${p.id}`} className="flex min-h-11 items-center justify-between gap-3 hover:text-primary">
                <span className="min-w-0 truncate">{p.course}</span>
                <span className="shrink-0 text-muted-foreground">{countdownLabel(daysBetween(today, p.examDate))}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
