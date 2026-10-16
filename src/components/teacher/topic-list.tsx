import type { TopicStruggle } from "@/lib/teacher/queries";

/**
 * Ranked topics as a labelled bar list: each bar is the topic's share of the
 * busiest topic's messages; the numbers are always written out.
 */
export function TopicList({ topics }: { topics: TopicStruggle[] }) {
  const max = Math.max(1, ...topics.map((t) => t.messages));
  return (
    <ol className="grid gap-4">
      {topics.map((t, i) => (
        <li key={t.topic} className="grid gap-1.5">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="min-w-0 sm:truncate">
              <span className="mr-2 font-mono text-small text-muted-foreground">{i + 1}</span>
              {t.topic}
            </span>
            <span className="shrink-0 text-small text-muted-foreground">
              <span className="font-mono text-foreground">{t.messages}</span> {t.messages === 1 ? "message" : "messages"} ·{" "}
              <span className="font-mono text-foreground">{t.students}</span>{" "}
              {t.students === 1 ? "student" : "students"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(t.messages / max) * 100}%` }} />
          </div>
          {t.answerSeeking > 0 ? (
            <p className="text-small text-muted-foreground">
              {t.answerSeeking} asked for the answer directly
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
