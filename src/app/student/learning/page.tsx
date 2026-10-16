import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { RelianceBadge } from "@/components/product/reliance-badge";
import { StatCard } from "@/components/product/stat-card";
import { RelianceLineChart } from "@/components/teacher/charts";
import { flagTypeLabels } from "@/components/teacher/flag-meta";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { daysAgo, formatShortDate, weeksAgo } from "@/lib/teacher/dates";

export const metadata: Metadata = { title: "My learning" };

export default function MyLearningPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MyLearning />
    </Suspense>
  );
}

function Panel({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border bg-surface p-6">
      <h2 id={id} className="text-title">
        {title}
      </h2>
      {note ? <p className="text-small text-muted-foreground">{note}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed px-4 py-6 text-center text-small text-muted-foreground">{children}</p>
  );
}

/**
 * The student's own data (PLAN.md §6, "My learning"): what they asked Sage
 * about, how often they showed their own working, their weekly Reliance Score
 * and the flags their teacher can see. Every query runs under row-level
 * security, so it can only ever return this student's rows.
 */
async function MyLearning() {
  await requireRole(["student"]);
  const db = await createClient();
  const now = new Date();
  const since = daysAgo(now, 28);

  const [{ data: messages }, { data: metrics }, { data: flags }, { count: submitted }] = await Promise.all([
    db
      .from("messages")
      .select("role, intent, attempted, topic, created_at")
      .eq("role", "user")
      .gte("created_at", since)
      .limit(2000),
    db.from("weekly_metrics").select("week, reliance_score").gte("week", weeksAgo(now, 7)).order("week"),
    db.from("flags").select("id, type, reason, status, created_at").order("created_at", { ascending: false }).limit(5),
    db.from("submissions").select("id", { count: "exact", head: true }).not("submitted_at", "is", null),
  ]);

  const asked = messages?.length ?? 0;
  const attempts = (messages ?? []).filter((m) => m.attempted).length;
  const topicCounts = new Map<string, number>();
  for (const m of messages ?? []) if (m.topic) topicCounts.set(m.topic, (topicCounts.get(m.topic) ?? 0) + 1);
  const topics = [...topicCounts].sort((a, b) => b[1] - a[1]).slice(0, 6);

  // One point per week: the average across the student's courses.
  const weeks = new Map<string, number[]>();
  for (const m of metrics ?? []) weeks.set(m.week, [...(weeks.get(m.week) ?? []), m.reliance_score]);
  const trend = [...weeks].map(([week, scores]) => ({
    label: formatShortDate(week),
    value: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }));
  const latest = trend.at(-1)?.value ?? null;

  if (!asked && !trend.length && !submitted) {
    return (
      <>
        <Header />
        <EmptyState
          icon={BookOpen}
          title="Your learning will show up here"
          description="Once you chat with Sage or write in Trace, you'll see the topics you worked on and how much of the thinking you did yourself."
          action={
            <Button asChild variant="secondary">
              <Link href="/student">Go to your courses</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Questions to Sage" value={asked} note="last 4 weeks" />
        <StatCard label="Times you showed your working" value={attempts} note="Sage climbs the hint ladder when you try" />
        <StatCard label="Writing submitted" value={submitted ?? 0} note="in Trace" />
        <StatCard
          label="Reliance Score"
          value={latest === null ? "—" : <RelianceBadge score={latest} />}
          note="this week · lower means you did more of the thinking"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:gap-8">
        <Panel
          id="my-trend"
          title="Your Reliance Score by week"
          note="Built from how often you asked for answers, how much of your writing was pasted, and whether you tried before Sage showed a worked example."
        >
          {trend.length ? (
            <RelianceLineChart title="Your Reliance Score by week" data={trend} />
          ) : (
            <Quiet>Your weekly score appears after your first week with Sage.</Quiet>
          )}
        </Panel>

        <Panel id="my-topics" title="Topics you worked on" note="What you asked Sage about, last 4 weeks.">
          {topics.length ? (
            <ul className="divide-y">
              {topics.map(([topic, n]) => (
                <li key={topic} className="flex items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="min-w-0">{topic}</span>
                  <span className="shrink-0 text-small text-muted-foreground">
                    <span className="font-mono text-foreground">{n}</span> {n === 1 ? "question" : "questions"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Quiet>Topics appear here after you chat with Sage.</Quiet>
          )}
        </Panel>
      </div>

      <div className="mt-8">
        <Panel
          id="teacher-sees"
          title="What your teacher sees"
          note="Your teacher sees summaries like the ones on this page, not your chats. A chat opens for them only if Sage raises a flag on it or you share it."
        >
          {flags?.length ? (
            <ul className="divide-y">
              {flags.map((f) => (
                <li key={f.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
                  <p className="text-label">
                    {flagTypeLabels[f.type]}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {formatShortDate(f.created_at)} · {f.status === "open" ? "open" : "looked at"}
                    </span>
                  </p>
                  <p className="text-small text-muted-foreground">{f.reason}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Quiet>No flags. Your teacher only sees the summary numbers.</Quiet>
          )}
        </Panel>
      </div>
    </>
  );
}

function Header() {
  return (
    <PageHeader
      eyebrow="My learning"
      title="Your learning so far"
      description="Everything SafeSight records about your learning is here, and you can see all of it."
    />
  );
}
