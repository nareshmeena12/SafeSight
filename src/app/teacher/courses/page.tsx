import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Download, Library, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { CourseDialog } from "@/components/teacher/course-dialog";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { listCourses } from "@/lib/teacher/queries";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CoursesContent />
    </Suspense>
  );
}

async function CoursesContent() {
  const user = await requireRole(["teacher", "admin"]);
  const courses = await listCourses(await createClient(), user.id);
  const newCourse = (
    <div className="flex flex-wrap gap-3">
      {/* S25: Google Classroom / Moodle import. */}
      <Button asChild variant="outline">
        <Link href="/teacher/integrations">
          <Download aria-hidden="true" />
          Import from Classroom or Moodle
        </Link>
      </Button>
      <CourseDialog
        trigger={
          <Button>
            <Plus aria-hidden="true" />
            New course
          </Button>
        }
      />
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Courses"
        title="Courses and assignments"
        description="Invite students with a join code and set how Sage may help on each assignment."
        actions={courses.length > 0 ? newCourse : null}
      />
      {courses.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No courses yet"
          description="Create a course and share its join code, or import your classes from Google Classroom or Moodle."
          action={newCourse}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {courses.map((c) => (
            <li key={c.id}>
              <Link
                href={`/teacher/courses/${c.id}`}
                className="group flex h-full flex-col gap-4 rounded-lg border bg-surface p-6 transition-colors duration-150 ease-out hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {c.code ? <p className="font-mono text-small text-muted-foreground">{c.code}</p> : null}
                    <h2 className="text-title">{c.name}</h2>
                  </div>
                  <ArrowRight
                    className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </div>
                <dl className="mt-auto grid grid-cols-3 gap-4 text-small">
                  <div>
                    <dt className="text-muted-foreground">Students</dt>
                    <dd className="font-mono text-foreground">{c.students}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Assignments</dt>
                    <dd className="font-mono text-foreground">{c.assignments}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Join code</dt>
                    <dd className="font-mono tracking-widest text-foreground">{c.joinCode}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
