import { Quote } from "lucide-react";
import { shareLabel, type Misconception } from "@/lib/brief/schema";

/** One misconception: share of the class, what students seem to think, their words, and a 5-minute explanation. */
export function MisconceptionCard({ m, index, enrolled }: { m: Misconception; index: number; enrolled: number }) {
  const pct = enrolled > 0 ? Math.round((Math.min(m.students, enrolled) / enrolled) * 100) : 0;
  return (
    <article aria-labelledby={`misconception-${index}`} className="grid gap-4 rounded-lg border bg-surface p-4 sm:p-6">
      <div className="grid gap-2">
        <p className="font-mono text-mono text-muted-foreground">{index + 1}</p>
        <h3 id={`misconception-${index}`} className="text-title text-balance">
          {m.title}
        </h3>
        <p className="text-muted-foreground">{m.summary}</p>
      </div>

      <div className="grid gap-1.5">
        <p className="flex flex-wrap items-baseline justify-between gap-2 text-small">
          <span className="text-muted-foreground">Share of class</span>
          <span className="font-mono text-mono">{shareLabel(m.students, enrolled)}</span>
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-hover" aria-hidden="true">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, m.students ? 3 : 0)}%` }} />
        </div>
      </div>

      {m.quotes.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-label text-muted-foreground">In their words (anonymised)</p>
          {m.quotes.map((q, i) => (
            <blockquote key={i} className="flex gap-2 rounded-md border-l-2 border-border-strong bg-background px-3 py-2 text-small">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0 break-words">{q}</span>
            </blockquote>
          ))}
        </div>
      ) : (
        <p className="text-small text-muted-foreground">
          No quotes: they&apos;re shown only when two or more students share a misconception, so no one stands out.
        </p>
      )}

      <div className="grid gap-2 rounded-md bg-primary-soft p-4">
        <p className="text-label">A 5-minute explanation</p>
        <p className="whitespace-pre-line text-small">{m.explanation}</p>
      </div>
    </article>
  );
}
