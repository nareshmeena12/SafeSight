import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { InviteList } from "@/components/setup/invite-list";
import { RosterImport } from "@/components/setup/roster-import";
import { ShareInvite } from "@/components/setup/share-invite";
import { JoinCode } from "@/components/teacher/join-code";
import { requireRole } from "@/lib/auth/dal";
import { emailConfigured } from "@/lib/email/send";
import { classInviteText } from "@/lib/setup/invite-email";
import { listInvites, siteUrl } from "@/lib/setup/invites";
import { teacherCourse } from "@/lib/setup/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invite students" };

export default function InviteStudentsPage({ params }: PageProps<"/teacher/courses/[courseId]/students">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InviteContent params={params} />
    </Suspense>
  );
}

async function InviteContent({ params }: Pick<PageProps<"/teacher/courses/[courseId]/students">, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  const db = await createClient();
  const course = await teacherCourse(db, user.id, courseId);
  if (!course) notFound();
  const [invites, { count: enrolled }] = await Promise.all([
    listInvites(db, course.id),
    db.from("enrollments").select("student_id", { count: "exact", head: true }).eq("course_id", course.id),
  ]);
  const emailReady = emailConfigured();

  return (
    <>
      <Link
        href={`/teacher/courses/${course.id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        {course.name}
      </Link>
      <PageHeader
        eyebrow={course.code || "Students"}
        title="Invite students"
        description={`${enrolled ?? 0} ${enrolled === 1 ? "student has" : "students have"} joined so far. Import your class list, or share the join code.`}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6 lg:col-span-7">
          <RosterImport courseId={course.id} emailReady={emailReady} />
          <InviteList courseId={course.id} invites={invites} emailReady={emailReady} />
        </div>
        <div className="grid min-w-0 grid-cols-1 content-start gap-6 lg:col-span-5">
          <section aria-labelledby="join-title" className="rounded-lg border bg-surface p-6">
            <h2 id="join-title" className="text-title">
              Join code
            </h2>
            <p className="mb-4 text-small text-muted-foreground">Students not on your list can join with this code.</p>
            <JoinCode courseId={course.id} code={course.joinCode} />
          </section>
          <section aria-labelledby="lms-title" className="rounded-lg border bg-surface p-6">
            <h2 id="lms-title" className="text-title">
              From Google Classroom or Moodle
            </h2>
            <p className="mb-3 text-small text-muted-foreground">
              Import the class list straight from your LMS. Moodle&apos;s participants CSV also works in the box on this page.
            </p>
            <Link href="/teacher/integrations" className="inline-flex min-h-11 items-center text-small font-medium text-primary underline-offset-4 hover:underline">
              Import classes
            </Link>
          </section>
          <ShareInvite
            emailReady={emailReady}
            text={classInviteText({
              courseName: course.name,
              courseCode: course.code,
              teacherName: user.fullName,
              joinCode: course.joinCode,
              siteUrl: siteUrl(),
            })}
          />
        </div>
      </div>
    </>
  );
}
