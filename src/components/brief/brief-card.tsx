import Link from "next/link";
import { ArrowRight, NotebookText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Brief } from "@/lib/brief/brief";
import { shareLabel } from "@/lib/brief/schema";
import { formatShortDate } from "@/lib/teacher/dates";

type CourseRef = { id: string; name: string; code: string };

/** "Before your next class" on the overview: each course's latest brief at a glance. */
export function BriefCard({ courses, briefs }: { courses: CourseRef[]; briefs: Map<string, Brief> }) {
  const shown = courses.slice(0, 3);
  return (
    <section aria-labelledby="brief-card-title" className="rounded-lg border bg-surface p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary">
            <NotebookText className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div>
            <h2 id="brief-card-title" className="text-title">
              Before your next class
            </h2>
            <p className="text-small text-muted-foreground">What students got stuck on this week, with a quiz to check it.</p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={shown.length === 1 ? `/teacher/brief?course=${shown[0].id}` : "/teacher/brief"}>
            Open brief
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <ul className="grid gap-3">
        {shown.map((c) => {
          const brief = briefs.get(c.id);
          const top = brief?.misconceptions ?? [];
          return (
            <li key={c.id} className="grid gap-2 rounded-md border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/teacher/brief?course=${c.id}`} className="text-label text-primary underline-offset-4 hover:underline">
                  {c.code ? `${c.code} · ${c.name}` : c.name}
                </Link>
                <span className="text-small text-muted-foreground">
                  {brief ? `Week of ${formatShortDate(brief.week)}` : "No brief yet"}
                </span>
              </div>
              {top.length > 0 ? (
                <ol className="grid gap-1">
                  {top.map((m, i) => (
                    <li key={i} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-small">
                      <span className="min-w-0">
                        <span className="mr-2 font-mono text-mono text-muted-foreground">{i + 1}</span>
                        {m.title}
                      </span>
                      <span className="font-mono text-mono text-muted-foreground">{shareLabel(m.students, brief!.stats.enrolled)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-small text-muted-foreground">
                  {brief
                    ? "Not enough questions to Sage this week to spot patterns."
                    : "Briefs are prepared every Monday morning. You can prepare one now from the brief page."}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
