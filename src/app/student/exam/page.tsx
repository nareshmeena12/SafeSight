import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, CalendarRange, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { PlanForm, type PlanFormCourse } from "@/components/exam/plan-form";
import { EmptyState } from "@/components/product/empty-state";
import { requireRole } from "@/lib/auth/dal";
import { addDays, countdownLabel, daysBetween, istToday, MAX_PLAN_DAYS, planProgress } from "@/lib/exam/plan";
import { planDaysSchema, syllabusTopicsSchema } from "@/lib/exam/schemas";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/teacher/dates";

export const metadata: Metadata = { title: "Exam prep" };

export default function ExamPrepPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExamPrep />
    </Suspense>
  );
}

/**
 * Exam prep home: the student's revision plans, a form to plan for an exam,
 * and their mock tests. Everything is read under row-level security, so only
 * the student's own plans and tests come back.
 */
async function ExamPrep() {
  await requireRole(["student"]);
  const db = await createClient();
  const today = istToday();
  const nowMs = new Date().getTime();
  const [{ data: courses }, { data: infos }, { data: plans }, { data: mocks }] = await Promise.all([
    db.from("courses").select("id, name, code").order("code"),
    db.from("course_exam_info").select("course_id, topics, exam_date"),
    db.from("exam_plans").select("id, course_id, exam_date, minutes_per_day, days, done").order("exam_date"),
    db
      .from("mock_tests")
      .select("id, title, started_at, submitted_at, graded_at, score, marks, max_marks, ends_at")
      .order("started_at", { ascending: false })
      .limit(8),
  ]);
  const courseList = courses ?? [];
  const label = (id: string) => {
    const c = courseList.find((x) => x.id === id);
    return c ? (c.code ? `${c.code} · ${c.name}` : c.name) : "Course";
  };
  const info = new Map((infos ?? []).map((i) => [i.course_id, i]));
  const upcoming = (plans ?? []).filter((p) => p.exam_date > today || p.exam_date === today);
  const past = (plans ?? []).filter((p) => p.exam_date < today);
  const formCourses: PlanFormCourse[] = courseList.map((c) => {
    const i = info.get(c.id);
    const official = i?.exam_date && i.exam_date > today ? i.exam_date : null;
    return {
      id: c.id,
      label: c.code ? `${c.code} · ${c.name}` : c.name,
      examDate: official,
      hasSyllabus: (syllabusTopicsSchema.safeParse(i?.topics ?? []).data ?? []).length > 0,
      planned: (plans ?? []).some((p) => p.course_id === c.id),
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Exam prep"
        title="Plan your revision"
        description="A day-by-day plan from your course topics and notes, aimed at the topics you find hardest, with timed mock tests. Practice only — nothing here is graded or sent to your teacher."
      />
      {!courseList.length ? (
        <EmptyState
          icon={BookOpen}
          title="Join a course first"
          description="Once you've joined a course with your teacher's class code, you can plan for its exam here."
        />
      ) : (
        <div className="grid gap-6 lg:gap-8">
          {upcoming.length ? (
            <section aria-labelledby="plans-title">
              <h2 id="plans-title" className="mb-4 text-title">
                Your plans
              </h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {upcoming.map((p) => {
                  const days = planDaysSchema.safeParse(p.days).data ?? [];
                  const progress = planProgress(days, p.done);
                  const left = daysBetween(today, p.exam_date);
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/student/exam/${p.id}`}
                        className="flex h-full flex-col gap-3 rounded-lg border bg-surface p-5 transition-colors duration-150 ease-out hover:border-border-strong"
                      >
                        <span className="text-eyebrow text-muted-foreground uppercase">{label(p.course_id)}</span>
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="font-serif text-headline-sm">{countdownLabel(left)}</span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                        </span>
                        <span className="text-small text-muted-foreground">
                          {formatShortDate(p.exam_date)} · <span className="font-mono text-foreground">{progress.done}</span>/
                          <span className="font-mono">{progress.total}</span> tasks done
                        </span>
                        <span className="h-1.5 w-full overflow-hidden rounded-full bg-border-strong/40" aria-hidden="true">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${progress.total ? Math.max(2, Math.round((progress.done / progress.total) * 100)) : 0}%` }}
                          />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="new-plan-title" className="rounded-lg border bg-surface p-4 sm:p-6">
            <h2 id="new-plan-title" className="flex items-center gap-2 text-title">
              <CalendarRange className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
              {upcoming.length ? "Plan for another exam" : "Plan for an exam"}
            </h2>
            <p className="mb-6 text-small text-muted-foreground">
              Pick the course, your exam date and how much time you have each day. Weak topics and repeated mistakes get more time.
            </p>
            <PlanForm courses={formCourses} minDate={addDays(today, 1)} maxDate={addDays(today, MAX_PLAN_DAYS)} />
          </section>

          <section aria-labelledby="mocks-title" className="rounded-lg border bg-surface p-4 sm:p-6">
            <h2 id="mocks-title" className="text-title">
              Mock tests
            </h2>
            <p className="text-small text-muted-foreground">Timed practice papers from your course notes. Start one from a plan.</p>
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
                          <span className="font-mono text-foreground">
                            {m.score !== null ? `${Math.round(m.score * 100)}%` : "—"}
                          </span>
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
            ) : (
              <p className="mt-4 rounded-md border border-dashed px-4 py-6 text-center text-small text-muted-foreground">
                No mock tests yet. Make a plan, then try a short 20-minute one.
              </p>
            )}
          </section>

          {past.length ? (
            <section aria-labelledby="past-title">
              <h2 id="past-title" className="mb-2 text-label text-muted-foreground">
                Earlier plans
              </h2>
              <ul className="-mx-2 grid">
                {past.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/student/exam/${p.id}`}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-sm px-2 text-small transition-colors duration-150 ease-out hover:bg-hover"
                    >
                      <span className="min-w-0 truncate">{label(p.course_id)}</span>
                      <span className="shrink-0 text-muted-foreground">Exam {formatShortDate(p.exam_date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
