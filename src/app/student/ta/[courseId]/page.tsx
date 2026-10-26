import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { DoubtQueue, StatusTabs } from "@/components/doubts/doubt-queue";
import { TaOverviewPanel } from "@/components/doubts/ta-overview";
import { requireRole } from "@/lib/auth/dal";
import { courseDoubts, staffCourses, taOverview } from "@/lib/doubts/data";
import { DOUBT_STATUSES, type DoubtStatus } from "@/lib/doubts/schemas";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Teaching assistant" };

/**
 * S21: a student who is a teaching assistant for a course: its overview
 * (class-level numbers only) and its doubts queue. Nothing else of the
 * teacher app.
 */
export default function TaCoursePage({ params, searchParams }: PageProps<"/student/ta/[courseId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TaCourse params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function TaCourse({
  params,
  searchParams,
}: Pick<PageProps<"/student/ta/[courseId]">, "params" | "searchParams">) {
  const user = await requireRole(["student"]);
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  const { status: asked } = await searchParams;
  const status: DoubtStatus | "all" =
    asked === "all" || DOUBT_STATUSES.includes(asked as DoubtStatus) ? (asked as DoubtStatus | "all") : "open";

  const supabase = await createClient();
  const course = (await staffCourses(supabase, user.id)).find((c) => c.id === courseId && c.role === "ta");
  if (!course) notFound();
  const [overview, doubts] = await Promise.all([taOverview(course.id), courseDoubts(supabase, [course.id], status)]);

  return (
    <>
      <Link
        href="/student/doubts"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Doubts
      </Link>
      <PageHeader
        eyebrow={`Teaching assistant${course.code ? ` · ${course.code}` : ""}`}
        title={course.name}
        description="Help classmates who are stuck. Answer in plain words and point them to the next step — the same way Sage does."
      />
      <div className="grid gap-6">
        <TaOverviewPanel overview={overview} />
        <StatusTabs basePath={`/student/ta/${course.id}`} query={{}} current={status} counts={{ open: overview.openDoubts }} />
        <DoubtQueue doubts={doubts} roles={new Map([[course.id, "ta" as const]])} status={status} />
      </div>
    </>
  );
}
