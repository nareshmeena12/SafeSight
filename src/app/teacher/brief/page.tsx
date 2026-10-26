import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock, Library, Mail, MessageCircleQuestion } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { GenerateBriefButton } from "@/components/brief/generate-brief-button";
import { MisconceptionCard } from "@/components/brief/misconception-card";
import { QuizPanel } from "@/components/brief/quiz-panel";
import { EmptyState } from "@/components/product/empty-state";
import { Button } from "@/components/ui/button";
import { aiStatus } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/dal";
import { latestBriefs } from "@/lib/brief/brief";
import { quizSessionsForBrief } from "@/lib/brief/quiz";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatShortDate } from "@/lib/teacher/dates";
import { courseParam } from "@/lib/teacher/params";
import { courseScope } from "@/lib/teacher/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Before your next class" };

export default function BriefPage({ searchParams }: PageProps<"/teacher/brief">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BriefContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BriefContent({ searchParams }: Pick<PageProps<"/teacher/brief">, "searchParams">) {
  const user = await requireRole(["teacher", "admin"]);
  const requested = courseParam(await searchParams);
  const db = await createClient();
  const courses = (await courseScope(db, user.id)) ?? [];
  const course = courses.find((c) => c.id === requested) ?? courses[0];
  const canEdit = user.role === "teacher";
  const configured = aiStatus().chat;

  const digestLink = (
    <Button asChild variant="ghost">
      <Link href="/teacher/brief/digest">
        <Mail aria-hidden="true" />
        Weekly digest
      </Link>
    </Button>
  );

  if (!course) {
    return (
      <>
        <PageHeader eyebrow="Before your next class" title="Pre-lecture brief" />
        <EmptyState
          icon={Library}
          title="No courses yet"
          description="Create a course and invite students. Once they ask Sage questions, the brief shows what they got stuck on."
          action={
            <Button asChild>
              <Link href="/teacher/courses">Create a course</Link>
            </Button>
          }
        />
      </>
    );
  }

  const brief = (await latestBriefs(db, [course.id])).get(course.id) ?? null;
  const runs = brief ? await quizSessionsForBrief(db, brief.id) : [];
  const courseLabel = course.code ? `${course.code} · ${course.name}` : course.name;

  const header = (
    <PageHeader
      eyebrow="Before your next class"
      title="Pre-lecture brief"
      description={`${courseLabel}: what students got stuck on in the last 7 days, a short explanation for each, and a quiz to check it.`}
      actions={
        <>
          {digestLink}
          {canEdit && configured && brief ? <GenerateBriefButton courseId={course.id} label="Refresh brief" variant="outline" /> : null}
        </>
      }
    />
  );

  const picker =
    courses.length > 1 ? (
      <nav aria-label="Course" className="-mt-4 mb-8 flex flex-wrap gap-2 lg:-mt-8">
        {courses.map((c) => (
          <Link
            key={c.id}
            href={`/teacher/brief?course=${c.id}`}
            aria-current={c.id === course.id ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-small transition-colors duration-150 ease-out",
              c.id === course.id ? "border-primary bg-primary-soft text-foreground" : "text-muted-foreground hover:bg-hover",
            )}
          >
            {c.code || c.name}
          </Link>
        ))}
      </nav>
    ) : null;

  if (!brief) {
    return (
      <>
        {header}
        {picker}
        <EmptyState
          icon={CalendarClock}
          title="No brief for this course yet"
          description={
            configured
              ? "Briefs are prepared every Monday morning from the week's questions to Sage. You can prepare one now."
              : "Lens isn't connected to its AI model yet, so briefs can't be prepared."
          }
          action={canEdit && configured ? <GenerateBriefButton courseId={course.id} label="Prepare this week's brief" /> : null}
        />
      </>
    );
  }

  const { stats } = brief;
  const meta = (
    <p className="text-small text-muted-foreground">
      Week of {formatShortDate(brief.week)} · read{" "}
      <span className="font-mono text-mono">{stats.messages}</span> questions from{" "}
      <span className="font-mono text-mono">{stats.students}</span> of{" "}
      <span className="font-mono text-mono">{stats.enrolled}</span> students ·{" "}
      {brief.source === "schedule" ? "prepared on schedule" : "prepared on request"}, {formatDateTime(brief.updatedAt)}
    </p>
  );

  if (brief.misconceptions.length === 0) {
    return (
      <>
        {header}
        {picker}
        <div className="grid gap-6">
          {meta}
          <EmptyState
            icon={MessageCircleQuestion}
            title="Not enough questions this week"
            description="The brief needs a handful of questions to Sage from at least two students to spot shared sticking points. Check back after students have worked on this week's problems."
          />
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      {picker}
      <div className="grid gap-8">
        <div className="grid gap-2">
          {meta}
          <p className="text-small text-muted-foreground">
            Quotes are anonymised and shown only in courses with five or more students, when two or more of them share a
            misconception. Names and roll numbers are removed before Lens reads anything.
          </p>
        </div>

        <section aria-labelledby="misconceptions-heading" className="grid gap-4">
          <h2 id="misconceptions-heading" className="text-title">
            Top misconceptions
          </h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {brief.misconceptions.map((m, i) => (
              <MisconceptionCard key={i} m={m} index={i} enrolled={stats.enrolled} />
            ))}
          </div>
        </section>

        {brief.quiz.length > 0 ? (
          <QuizPanel
            briefId={brief.id}
            title={`${course.code || course.name} · quick check, week of ${formatShortDate(brief.week)}`}
            questions={brief.quiz}
            misconceptions={brief.misconceptions.map((m) => m.title)}
            runs={runs}
            canRun={canEdit}
          />
        ) : (
          <section className="rounded-lg border border-dashed bg-surface/60 p-6 text-small text-muted-foreground">
            The quiz couldn&apos;t be written this time. Press &ldquo;Refresh brief&rdquo; to try again.
          </section>
        )}
      </div>
    </>
  );
}
