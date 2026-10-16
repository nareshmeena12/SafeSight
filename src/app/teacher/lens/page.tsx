import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { LensChat } from "@/components/lens/lens-chat";
import { CourseFilter } from "@/components/teacher/course-filter";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { courseParam, param } from "@/lib/teacher/params";
import { courseScope } from "@/lib/teacher/queries";

export const metadata: Metadata = { title: "Lens" };

export default function LensPage({ searchParams }: PageProps<"/teacher/lens">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LensContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LensContent({ searchParams }: Pick<PageProps<"/teacher/lens">, "searchParams">) {
  const user = await requireRole(["teacher", "admin"]);
  const params = await searchParams;
  const courses = (await courseScope(await createClient(), user.id)) ?? [];
  const requested = courseParam(params);
  const courseId = requested && courses.some((c) => c.id === requested) ? requested : null;
  const question = param(params, "q")?.slice(0, 2000);

  return (
    <>
      <PageHeader
        eyebrow="Lens"
        title="Ask about your class"
        description="Answers come from your own courses only, with names, numbers and small charts."
        actions={<CourseFilter courses={courses} value={courseId} />}
      />
      {/* Remount when the course changes so the chat starts fresh for that scope. */}
      <LensChat key={courseId ?? "all"} courseId={courseId} initialQuestion={question} />
    </>
  );
}
