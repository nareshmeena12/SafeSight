import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { JoinCourseForm } from "@/components/setup/join-course-form";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Join a course" };

export default function JoinPage({ searchParams }: PageProps<"/student/join">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JoinContent searchParams={searchParams} />
    </Suspense>
  );
}

async function JoinContent({ searchParams }: Pick<PageProps<"/student/join">, "searchParams">) {
  await requireRole(["student"]);
  const { code } = await searchParams;
  const prefill = typeof code === "string" && /^[A-Za-z0-9]{6}$/.test(code) ? code.toUpperCase() : undefined;
  return (
    <div className="max-w-xl">
      <PageHeader eyebrow="Courses" title="Join a course" description="Enter the class code from your teacher." />
      <JoinCourseForm code={prefill} />
    </div>
  );
}
