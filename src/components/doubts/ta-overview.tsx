import { ModeBadge } from "@/components/product/mode-badge";
import { StatCard } from "@/components/product/stat-card";
import type { TaOverview } from "@/lib/doubts/data";
import { formatShortDate } from "@/lib/teacher/dates";

/**
 * The course overview a teaching assistant sees: class-level numbers for
 * the last 7 days, the topics students ask Sage about, and what's due. No
 * names, no scores per student and no chat text.
 */
export function TaOverviewPanel({ overview }: { overview: TaOverview }) {
  return (
    <section aria-labelledby="ta-overview-title" className="grid gap-4">
      <h2 id="ta-overview-title" className="sr-only">
        Course overview
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Questions waiting" value={overview.openDoubts} highlight={overview.openDoubts > 0} />
        <StatCard label="Answered this week" value={overview.answeredThisWeek} />
        <StatCard label="Students using Sage" value={overview.activeStudents} note={`of ${overview.enrolled} enrolled · last 7 days`} />
        <StatCard label="Questions to Sage" value={overview.messages} note="last 7 days" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-surface p-5">
          <h3 className="text-label">Topics students ask about</h3>
          {overview.topics.length ? (
            <ol className="mt-3 grid gap-2">
              {overview.topics.map((t) => (
                <li key={t.topic} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate capitalize">{t.topic}</span>
                  <span className="font-mono text-mono text-muted-foreground">{t.count}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-small text-muted-foreground">No questions to Sage this week yet.</p>
          )}
        </div>
        <div className="rounded-lg border bg-surface p-5">
          <h3 className="text-label">Coming up</h3>
          {overview.upcoming.length ? (
            <ul className="mt-3 grid gap-2">
              {overview.upcoming.map((a, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">{a.title}</span>
                  <span className="flex items-center gap-2 text-small text-muted-foreground">
                    <ModeBadge mode={a.mode} />
                    {a.dueAt ? `Due ${formatShortDate(a.dueAt)}` : "No due date"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-small text-muted-foreground">Nothing due right now.</p>
          )}
        </div>
      </div>
    </section>
  );
}
