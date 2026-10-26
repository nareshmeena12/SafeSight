import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Library, Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { BriefCard } from "@/components/brief/brief-card";
import { LensBox } from "@/components/lens/lens-box";
import { EmptyState } from "@/components/product/empty-state";
import { StatCard } from "@/components/product/stat-card";
import { CountBarChart, RelianceLineChart } from "@/components/teacher/charts";
import { CourseFilter } from "@/components/teacher/course-filter";
import { RefreshMetricsButton } from "@/components/teacher/refresh-metrics";
import { TopicList } from "@/components/teacher/topic-list";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { latestBriefs } from "@/lib/brief/brief";
import { relianceBand } from "@/lib/reliance";
import { createClient } from "@/lib/supabase/server";
import { daysAgo, formatShortDate } from "@/lib/teacher/dates";
import { courseParam } from "@/lib/teacher/params";
import { getClassOverview, getTopicStruggles } from "@/lib/teacher/queries";

export const metadata: Metadata = { title: "Overview" };

const bandLabels = { low: "Low band", medium: "Medium band", high: "High band" } as const;

export default function TeacherHome({ searchParams }: PageProps<"/teacher">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeacherHomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function TeacherHomeContent({ searchParams }: Pick<PageProps<"/teacher">, "searchParams">) {
  const user = await requireRole(["teacher", "admin"]);
  const requested = courseParam(await searchParams);
  const db = await createClient();
  const now = new Date();

  const overview =
    (await getClassOverview(db, user.id, { courseId: requested, now })) ??
    (await getClassOverview(db, user.id, { now }))!;
  const courseId = overview.scope.length === 1 && requested ? requested : null;
  const firstName = user.fullName.split(" ")[0];

  const header = (
    <PageHeader
      eyebrow="Overview"
      title={firstName ? `Welcome, ${firstName}` : "Welcome"}
      description="How your class is learning with Sage, at a glance."
      actions={
        overview.scope.length > 0 ? (
          <>
            <CourseFilter courses={overview.scope} value={courseId} />
            <RefreshMetricsButton courseId={courseId} />
          </>
        ) : null
      }
    />
  );

  if (overview.scope.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={Library}
          title="No courses yet"
          description="Create your first course to invite students and set an AI mode for each assignment."
          action={
            <Button asChild>
              <Link href="/teacher/courses">Create a course</Link>
            </Button>
          }
        />
      </>
    );
  }

  const briefCourses = courseId ? overview.scope.filter((c) => c.id === courseId) : overview.scope;
  const [topics, briefs] = await Promise.all([
    getTopicStruggles(db, { courseId, from: daysAgo(now, 28), limit: 5 }),
    latestBriefs(db, briefCourses.map((c) => c.id)),
  ]);
  const trend = overview.trend.map((p) => ({ label: formatShortDate(p.week), value: p.avgReliance }));
  const volume = overview.trend.map((p) => ({ label: formatShortDate(p.week), value: p.messages }));
  const hasTrend = overview.trend.some((p) => p.avgReliance !== null);

  return (
    <>
      {header}
      <div className="grid gap-6 lg:gap-8">
        <section aria-label="This week" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Active students"
            value={overview.activeStudents}
            note={`of ${overview.enrolledStudents} enrolled · last 7 days`}
          />
          <StatCard
            label="AI conversations"
            value={overview.conversations}
            note={`${overview.messages} student messages · last 7 days`}
          />
          <StatCard
            label="Average Reliance Score"
            value={overview.avgReliance === null ? "—" : Math.round(overview.avgReliance)}
            note={
              overview.avgReliance === null ? (
                "Appears once students use Sage"
              ) : (
                `${bandLabels[relianceBand(overview.avgReliance)]}${
                  overview.relianceWeek ? ` · week of ${formatShortDate(overview.relianceWeek)}` : ""
                }`
              )
            }
          />
          <Link href="/teacher/flags" className="group rounded-lg">
            <StatCard
              label="Open flags"
              value={overview.openFlags}
              highlight={overview.openFlags > 0}
              note={
                overview.highSeverityFlags > 0
                  ? `${overview.highSeverityFlags} high priority`
                  : overview.openFlags > 0
                    ? "Review when you have a moment"
                    : "Nothing to review"
              }
              className="h-full transition-colors duration-150 ease-out group-hover:border-border-strong"
            />
          </Link>
        </section>

        <BriefCard courses={briefCourses} briefs={briefs} />

        <LensBox courseId={courseId} />

        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
          <section aria-labelledby="trend-title" className="rounded-lg border bg-surface p-6 lg:col-span-7">
            <h2 id="trend-title" className="text-title">
              Weekly trend
            </h2>
            <p className="mb-6 text-small text-muted-foreground">Last 8 weeks. Higher scores mean more reliance on AI.</p>
            {hasTrend ? (
              <div className="grid gap-8 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-label text-muted-foreground">Average Reliance Score</h3>
                  <RelianceLineChart data={trend} />
                </div>
                <div>
                  <h3 className="mb-2 text-label text-muted-foreground">Student messages to Sage</h3>
                  <CountBarChart data={volume} title="Student messages to Sage by week" />
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-dashed px-4 py-8 text-center text-small text-muted-foreground">
                The trend fills in week by week as your students use Sage. Press “Update numbers” to recompute.
              </p>
            )}
          </section>

          <section aria-labelledby="topics-title" className="rounded-lg border bg-surface p-6 lg:col-span-5">
            <h2 id="topics-title" className="text-title">
              Top struggling topics
            </h2>
            <p className="mb-6 text-small text-muted-foreground">What students asked Sage about most, last 4 weeks.</p>
            {topics.length > 0 ? (
              <TopicList topics={topics} />
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center">
                <Lightbulb className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-small text-muted-foreground">
                  Topics appear here once students start asking Sage questions.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
