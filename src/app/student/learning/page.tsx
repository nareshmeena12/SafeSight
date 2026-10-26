import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { MasteryBadge, MasteryBar } from "@/components/learning/mastery";
import { PracticeButton } from "@/components/learning/practice-button";
import { RecapCard } from "@/components/learning/recap-card";
import { EmptyState } from "@/components/product/empty-state";
import { StatCard } from "@/components/product/stat-card";
import { RelianceLineChart } from "@/components/teacher/charts";
import { flagTypeLabels } from "@/components/teacher/flag-meta";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { reviewList, setScore } from "@/lib/learning/mastery";
import { flashcardsSchema, learnedSchema } from "@/lib/learning/schemas";
import { topicKey, topicLabel } from "@/lib/learning/topics";
import { relianceBand } from "@/lib/reliance";
import { createClient } from "@/lib/supabase/server";
import { daysAgo, formatShortDate, weeksAgo } from "@/lib/teacher/dates";

export const metadata: Metadata = { title: "My learning" };

const bandLabel = { low: "Low", medium: "Medium", high: "High" } as const;

export default function MyLearningPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MyLearning />
    </Suspense>
  );
}

function Panel({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-lg border bg-surface p-4 sm:p-6">
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
 * about, how often they showed their own working, mastery per topic with
 * practice, the mistake log and review list, recaps and flashcards, their
 * weekly Reliance Score and the flags their teacher can see. Every query runs
 * under row-level security, so it can only ever return this student's rows.
 */
async function MyLearning() {
  await requireRole(["student"]);
  const db = await createClient();
  const now = new Date();
  const since = daysAgo(now, 28);

  const [
    { data: messages },
    { data: metrics },
    { data: flags },
    { count: submitted },
    { data: courses },
    { data: mastery },
    { data: mistakes },
    { data: recaps },
    { data: sets },
    { data: explained },
  ] = await Promise.all([
    db
      .from("messages")
      .select("role, intent, attempted, topic, created_at, conversations(course_id)")
      .eq("role", "user")
      .gte("created_at", since)
      .limit(2000),
    db.from("weekly_metrics").select("week, reliance_score").gte("week", weeksAgo(now, 7)).order("week"),
    db.from("flags").select("id, type, reason, status, created_at").order("created_at", { ascending: false }).limit(5),
    db.from("submissions").select("id", { count: "exact", head: true }).not("submitted_at", "is", null),
    db.from("courses").select("id, name, code").order("code"),
    db.from("topic_mastery").select("course_id, topic_key, topic, mastery, evidence, updated_at").order("updated_at", { ascending: false }).limit(60),
    db
      .from("mistake_patterns")
      .select("id, course_id, label, topic, topic_key, count, last_seen_at, reviewed_at")
      .order("count", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .limit(20),
    db.from("sage_recaps").select("id, course_id, title, learned, flashcards, created_at").order("created_at", { ascending: false }).limit(4),
    db
      .from("practice_sets")
      .select("id, course_id, kind, topic, skill, score, completed_at, created_at, practice_items(score)")
      .order("created_at", { ascending: false })
      .limit(8),
    db.from("explain_backs").select("id, topic, score, feedback, created_at").order("created_at", { ascending: false }).limit(3),
  ]);
  const courseList = courses ?? [];
  const courseName = new Map(courseList.map((c) => [c.id, c.code || c.name]));
  const multiCourse = courseList.length > 1;

  const asked = messages?.length ?? 0;
  const attempts = (messages ?? []).filter((m) => m.attempted).length;
  // Topics: what the student asked Sage about, joined with mastery from practice and explain-backs.
  const topicRows = new Map<string, { courseId: string; topic: string; questions: number; mastery: number | null; evidence: number }>();
  for (const m of mastery ?? []) {
    topicRows.set(`${m.course_id}:${m.topic_key}`, { courseId: m.course_id, topic: m.topic, questions: 0, mastery: m.mastery, evidence: m.evidence });
  }
  for (const m of messages ?? []) {
    const courseId = m.conversations?.course_id;
    if (!m.topic || !courseId) continue;
    const key = `${courseId}:${topicKey(m.topic)}`;
    const row = topicRows.get(key) ?? { courseId, topic: topicLabel(m.topic), questions: 0, mastery: null, evidence: 0 };
    row.questions += 1;
    topicRows.set(key, row);
  }
  const topics = [...topicRows.values()]
    .sort((a, b) => Number(b.mastery !== null) - Number(a.mastery !== null) || b.questions - a.questions)
    .slice(0, 10);

  const review = reviewList(
    (mastery ?? []).map((m) => ({ ...m, topicKey: m.topic_key })),
    (mistakes ?? []).map((m) => ({ topicKey: m.topic_key, count: m.count, reviewed: Boolean(m.reviewed_at) })),
  ).slice(0, 6);
  const openMistakes = (mistakes ?? []).filter((m) => !m.reviewed_at);
  // "Review before exam" per course that has something to review.
  const reviewCourses = courseList.filter(
    (c) => openMistakes.some((m) => m.course_id === c.id) || review.some((r) => r.course_id === c.id),
  );
  const history = [
    ...(sets ?? []).map((s) => ({
      id: s.id,
      at: s.created_at,
      href: `/student/learning/practice/${s.id}`,
      title: s.kind === "refresher" ? `Refresher: ${s.skill ?? s.topic}` : s.kind === "review" ? "Review before exam" : `Practice: ${s.topic}`,
      score: s.completed_at ? s.score : setScore(s.practice_items.map((i) => i.score)),
      done: Boolean(s.completed_at),
    })),
  ].slice(0, 6);

  // One point per week: the higher score across the student's courses (what the teacher's table shows).
  const weeks = new Map<string, number>();
  for (const m of metrics ?? []) weeks.set(m.week, Math.max(weeks.get(m.week) ?? 0, m.reliance_score));
  const trend = [...weeks].map(([week, score]) => ({ label: formatShortDate(week), value: Math.round(score) }));
  const latest = trend.at(-1)?.value ?? null;

  const hasLearning = Boolean(topics.length || mistakes?.length || recaps?.length || sets?.length || explained?.length);
  if (!asked && !trend.length && !submitted && !hasLearning) {
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
          value={latest ?? "—"}
          note={
            latest === null
              ? "appears after a week with Sage"
              : `${bandLabel[relianceBand(latest)]} band this week · lower means you did more of the thinking`
          }
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

        <Panel id="my-topics" title="Your topics" note="What you asked Sage about in the last 4 weeks, and how well you know it from practice.">
          {topics.length ? (
            <ul className="divide-y">
              {topics.map((t) => (
                <li key={`${t.courseId}-${t.topic}`} className="grid gap-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0">
                      {t.topic}
                      {multiCourse ? <span className="text-small text-muted-foreground"> · {courseName.get(t.courseId)}</span> : null}
                    </span>
                    {t.mastery !== null ? (
                      <MasteryBadge mastery={t.mastery} />
                    ) : (
                      <span className="text-small text-muted-foreground">No practice yet</span>
                    )}
                  </div>
                  {t.mastery !== null ? <MasteryBar mastery={t.mastery} /> : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-small text-muted-foreground">
                      {t.questions ? (
                        <>
                          <span className="font-mono text-foreground">{t.questions}</span> {t.questions === 1 ? "question" : "questions"} to Sage
                        </>
                      ) : null}
                      {t.questions && t.evidence ? " · " : null}
                      {t.evidence ? (
                        <>
                          <span className="font-mono text-foreground">{t.evidence}</span> {t.evidence === 1 ? "check" : "checks"}
                        </>
                      ) : null}
                    </span>
                    <PracticeButton courseId={t.courseId} topic={t.topic} label="Practice" size="sm" variant="ghost" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Quiet>Topics appear here after you chat with Sage. Then you can practise any of them.</Quiet>
          )}
        </Panel>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:gap-8">
        <Panel
          id="review"
          title="Review before your exam"
          note="Mistakes Sage noticed in your working more than once, and topics where your practice scores are lower."
        >
          {openMistakes.length || review.length ? (
            <div className="grid gap-6">
              {openMistakes.length ? (
                <div>
                  <h3 className="mb-2 text-label">Mistake log</h3>
                  <ul className="divide-y">
                    {openMistakes.slice(0, 6).map((m) => (
                      <li key={m.id} className="flex items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="min-w-0">
                          {m.label}
                          {m.topic ? <span className="text-small text-muted-foreground"> · {m.topic}</span> : null}
                        </span>
                        <span className="shrink-0 text-small text-muted-foreground">
                          <span className="font-mono text-foreground">×{m.count}</span> · {formatShortDate(m.last_seen_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {review.length ? (
                <div>
                  <h3 className="mb-2 text-label">Topics to strengthen</h3>
                  <ul className="divide-y">
                    {review.map((r) => (
                      <li key={`${r.course_id}-${r.topic_key}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="min-w-0">{r.topic}</span>
                        <MasteryBadge mastery={r.mastery} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {reviewCourses.map((c) => (
                  <PracticeButton
                    key={c.id}
                    courseId={c.id}
                    topic="Review before exam"
                    kind="review"
                    label={multiCourse ? `Review before exam · ${c.code || c.name}` : "Review before exam"}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Quiet>Nothing to review yet. When Sage spots the same slip twice, or a topic needs more practice, it shows up here.</Quiet>
          )}
        </Panel>

        <Panel id="practice-history" title="Recent practice" note="Practice sets, refreshers and ideas you explained in your own words.">
          {history.length || explained?.length ? (
            <div className="grid gap-6">
              {history.length ? (
                <ul className="-mx-2 grid min-w-0">
                  {history.map((h) => (
                    <li key={h.id} className="min-w-0">
                      <Link
                        href={h.href}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-sm px-2 py-2 transition-colors duration-150 ease-out hover:bg-hover"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{h.title}</span>
                          <span className="text-small text-muted-foreground">{formatShortDate(h.at)}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-small text-muted-foreground">
                          {h.done ? <span className="font-mono text-foreground">{Math.round((h.score ?? 0) * 100)}%</span> : "Continue"}
                          <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {explained?.length ? (
                <div>
                  <h3 className="mb-2 text-label">Explained in your own words</h3>
                  <ul className="grid gap-3">
                    {explained.map((e) => (
                      <li key={e.id} className="grid gap-1">
                        <p className="text-small">
                          {e.topic}{" "}
                          <span className="text-muted-foreground">
                            · <span className="font-mono text-foreground">{Math.round(e.score * 100)}%</span> · {formatShortDate(e.created_at)}
                          </span>
                        </p>
                        <p className="line-clamp-2 text-small break-words text-muted-foreground">{e.feedback.replace(/\$+/g, "")}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <Quiet>Press Practice on a topic, or Practice this under one of Sage&apos;s explanations, to test yourself.</Quiet>
          )}
        </Panel>
      </div>

      <div className="mt-8">
        <Panel id="recaps" title="Recaps and flashcards" note="Sage writes these when a chat ends or goes quiet for a while.">
          {recaps?.length ? (
            <ul className="grid gap-4">
              {recaps.map((r) => (
                <li key={r.id}>
                  <RecapCard
                    recap={{
                      title: r.title,
                      learned: learnedSchema.safeParse(r.learned).data ?? [],
                      flashcards: flashcardsSchema.safeParse(r.flashcards).data ?? [],
                    }}
                    note={`${formatShortDate(r.created_at)}${multiCourse ? ` · ${courseName.get(r.course_id) ?? ""}` : ""}`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <Quiet>After your next chat with Sage, a short recap and 3 flashcards appear here.</Quiet>
          )}
        </Panel>
      </div>

      <div className="mt-8">
        <Panel
          id="teacher-sees"
          title="What your teacher sees"
          note="Your teacher sees summaries like your scores and mastery per topic — not your chats, practice answers, explanations, recaps or mistake log. A chat opens for them only if Sage raises a flag on it or you share it."
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
