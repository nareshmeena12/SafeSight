import Link from "next/link";
import { relianceTrendLine, type DigestContent } from "@/lib/digest/content";
import { formatShortDate } from "@/lib/teacher/dates";

/** The digest as the teacher would read it, one card per course. Counts and averages only. */
export function DigestPreview({ content }: { content: DigestContent }) {
  if (content.courses.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">You have no courses yet.</p>;
  }
  return (
    <section aria-labelledby="digest-heading" className="grid gap-4">
      <h2 id="digest-heading" className="text-title">
        This week · week of {formatShortDate(content.week)}
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {content.courses.map((c) => (
          <article key={c.id} className="grid content-start gap-3 rounded-lg border bg-surface p-4 sm:p-6">
            <h3 className="text-label">{c.code ? `${c.code} · ${c.name}` : c.name}</h3>
            <div className="grid gap-1">
              <p className="text-small text-muted-foreground">Before your next class</p>
              {c.brief && c.brief.misconceptions.length > 0 ? (
                <ol className="grid gap-1 text-small">
                  {c.brief.misconceptions.map((m, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-x-3">
                      <span>
                        <span className="mr-2 font-mono text-mono text-muted-foreground">{i + 1}</span>
                        {m.title}
                      </span>
                      <span className="font-mono text-mono text-muted-foreground">
                        {m.students} of {c.enrolled}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-small">No brief with enough questions this week.</p>
              )}
              <Link href={`/teacher/brief?course=${c.id}`} className="inline-flex min-h-11 items-center text-small text-primary underline-offset-4 hover:underline">
                Open the brief
              </Link>
            </div>
            <dl className="grid grid-cols-3 gap-2 border-t pt-3">
              <div>
                <dt className="text-small text-muted-foreground">Open flags</dt>
                <dd className="font-mono text-mono-stat">{c.flags.open}</dd>
              </div>
              <div>
                <dt className="text-small text-muted-foreground">New, 7 days</dt>
                <dd className="font-mono text-mono-stat">{c.flags.newThisWeek}</dd>
              </div>
              <div>
                <dt className="text-small text-muted-foreground">High priority</dt>
                <dd className="font-mono text-mono-stat">{c.flags.high}</dd>
              </div>
            </dl>
            <p className="text-small">
              {relianceTrendLine(c.reliance.weeks)}
              {c.reliance.highBand ? `; ${c.reliance.highBand} in the high band last week` : ""}.
            </p>
            <ol aria-label="Average Reliance Score, last four weeks" className="grid grid-cols-4 gap-2">
              {c.reliance.weeks.map((w) => (
                <li key={w.week} className="rounded-sm border px-2 py-1 text-center">
                  <span className="block text-small text-muted-foreground">{formatShortDate(w.week)}</span>
                  <span className="font-mono text-mono">{w.avg === null ? "—" : Math.round(w.avg)}</span>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
