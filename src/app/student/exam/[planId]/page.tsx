import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { PlanActions } from "@/components/exam/plan-actions";
import { PlanBoard } from "@/components/exam/plan-board";
import { StartMockButton } from "@/components/exam/start-mock-button";
import { requireRole } from "@/lib/auth/dal";
import { countdownLabel, daysBetween, istToday, mockSize, scoreTopic } from "@/lib/exam/plan";
import { planDaysSchema, planSourcesSchema, planTopicsSchema } from "@/lib/exam/schemas";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/teacher/dates";

export const metadata: Metadata = { title: "Revision plan" };

export default function PlanPage({ params }: PageProps<"/student/exam/[planId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Plan params={params} />
    </Suspense>
  );
}

const longDate = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** One revision plan, read under row-level security (only the student's own comes back). */
async function Plan({ params }: Pick<PageProps<"/student/exam/[planId]">, "params">) {
  const user = await requireRole(["student"]);
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();
  const db = await createClient();
  const { data: plan } = await db
    .from("exam_plans")
    .select("id, course_id, exam_date, minutes_per_day, topics, days, done, checked, sources, courses(name, code)")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) notFound();
  const [{ data: mastery }, { data: mocks }] = await Promise.all([
    db.from("topic_mastery").select("topic, topic_key, mastery, evidence").eq("student_id", user.id).eq("course_id", plan.course_id),
    db
      .from("mock_tests")
      .select("id, title, started_at, submitted_at, graded_at, score, ends_at")
      .eq("plan_id", plan.id)
      .order("started_at", { ascending: false })
      .limit(6),
  ]);

  const today = istToday();
  const nowMs = new Date().getTime();
  const left = daysBetween(today, plan.exam_date);
  const days = planDaysSchema.safeParse(plan.days).data ?? [];
  const sources = planSourcesSchema.safeParse(plan.sources).data ?? { syllabus: false, notes: false, pattern: "", skipped: [] };
  // Mastery as it is now (practice and mock tests since the plan was made move it).
  const signals = {
    mastery: (mastery ?? []).map((m) => ({ topic: m.topic, topicKey: m.topic_key, mastery: m.mastery, evidence: m.evidence })),
    mistakes: [],
    asked: [],
  };
  const topics = (planTopicsSchema.safeParse(plan.topics).data ?? []).map((t) => {
    const now = scoreTopic({ title: t.title, source: t.source }, signals);
    return { ...t, mastery: now.mastery ?? t.mastery, reasons: now.mastery === null ? t.reasons : [now.reasons[0], ...t.reasons.slice(1)] };
  });
  const course = plan.courses ? (plan.courses.code ? `${plan.courses.code} · ${plan.courses.name}` : plan.courses.name) : "";
  const size = mockSize(plan.minutes_per_day);
  const daily = plan.minutes_per_day < 60 ? `${plan.minutes_per_day} minutes` : plan.minutes_per_day === 60 ? "1 hour" : `${plan.minutes_per_day / 60} hours`;
  const from = sources.syllabus ? "your teacher's syllabus" : sources.notes ? "topics in your course notes" : "the topics you've worked on with Sage";

  return (
    <>
      <Link href="/student/exam" className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Exam prep
      </Link>
      <PageHeader
        eyebrow={`Revision plan${course ? ` · ${course}` : ""}`}
        title={countdownLabel(left)}
        description={`Exam on ${longDate.format(new Date(`${plan.exam_date}T00:00:00Z`))} · ${daily} a day · built from ${from}, weighted by your mastery and mistake log.`}
        actions={<PlanActions planId={plan.id} canRebuild={left > 0} />}
      />

      {sources.pattern || sources.skipped.length || !topics.length ? (
        <div className="mb-6 grid gap-3 lg:mb-8">
          {sources.pattern ? (
            <section aria-labelledby="pattern-title" className="rounded-lg border bg-surface p-4 sm:p-6">
              <h2 id="pattern-title" className="text-label">
                Exam pattern from your teacher
              </h2>
              <p className="mt-1 text-small whitespace-pre-line text-muted-foreground">{sources.pattern}</p>
            </section>
          ) : null}
          {sources.skipped.length ? (
            <p className="flex items-start gap-2 rounded-lg border bg-surface px-4 py-3 text-small text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span>
                Not enough days for: {sources.skipped.join(", ")}. Add more time each day, or skim them in your notes.
              </span>
            </p>
          ) : null}
          {!topics.length ? (
            <p className="flex items-start gap-2 rounded-lg border bg-surface px-4 py-3 text-small text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span>
                We didn&apos;t find topics for this course yet — no syllabus or notes, and no chats with Sage. The plan has
                reviews and mock tests for now; chat with Sage or ask your teacher to add notes, then press Update plan.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <PlanBoard
        planId={plan.id}
        courseId={plan.course_id}
        today={today}
        days={days}
        topics={topics}
        initialDone={plan.done}
        initialChecked={plan.checked}
        mockSize={size}
      />

      <section aria-labelledby="plan-mocks-title" className="mt-6 rounded-lg border bg-surface p-4 sm:p-6 lg:mt-8">
        <h2 id="plan-mocks-title" className="text-title">
          Mock tests
        </h2>
        <p className="text-small text-muted-foreground">
          Timed papers from your course notes on your weakest topics — a mix of conceptual and numerical questions, marked with
          explanations when you hand in. Practice only: not an assignment, not graded, and not shown to your teacher.
        </p>
        {mocks?.length ? (
          <ul className="-mx-2 mt-4 grid">
            {mocks.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/student/exam/mock/${m.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-sm px-2 py-2 transition-colors duration-150 ease-out hover:bg-hover"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{m.title}</span>
                    <span className="text-small text-muted-foreground">{formatShortDate(m.started_at)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-small text-muted-foreground">
                    {m.graded_at ? (
                      <span className="font-mono text-foreground">{m.score !== null ? `${Math.round(m.score * 100)}%` : "—"}</span>
                    ) : m.submitted_at || Date.parse(m.ends_at) < nowMs ? (
                      "Marking"
                    ) : (
                      "In progress"
                    )}
                    <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {left > 0 && topics.length ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <StartMockButton planId={plan.id} size="short" variant={size === "short" ? "default" : "secondary"} />
            <StartMockButton planId={plan.id} size="full" variant={size === "full" ? "default" : "secondary"} />
          </div>
        ) : null}
      </section>
    </>
  );
}
