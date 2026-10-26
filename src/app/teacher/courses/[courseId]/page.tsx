import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  CalendarCheck,
  ChevronLeft,
  ClipboardList,
  FileText,
  HandHelping,
  ListTree,
  MessagesSquare,
  Pencil,
  Plus,
  UserPlus,
  Users,
  Variable,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { CourseTas } from "@/components/doubts/course-tas";
import { ExamInfoDialog } from "@/components/exam/exam-info-dialog";
import { EmptyState } from "@/components/product/empty-state";
import { ModeBadge } from "@/components/product/mode-badge";
import { SetupChecklist } from "@/components/setup/setup-checklist";
import { AssignmentDialog } from "@/components/teacher/assignment-dialog";
import { CourseDialog } from "@/components/teacher/course-dialog";
import { DeleteAssignment } from "@/components/teacher/delete-assignment";
import { JoinCode } from "@/components/teacher/join-code";
import { Button } from "@/components/ui/button";
import { coursePolicy } from "@/lib/admin/queries";
import { requireRole } from "@/lib/auth/dal";
import { courseTas } from "@/lib/doubts/data";
import { syllabusTopicsSchema } from "@/lib/exam/schemas";
import { syllabusText } from "@/lib/exam/syllabus";
import { setupDone, setupSteps } from "@/lib/setup/checklist";
import { setupProgress } from "@/lib/setup/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatShortDate } from "@/lib/teacher/dates";
import { getCourseDetail } from "@/lib/teacher/queries";
import { z } from "zod";

export const metadata: Metadata = { title: "Course" };

export default function CoursePage({ params }: PageProps<"/teacher/courses/[courseId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CourseContent params={params} />
    </Suspense>
  );
}

async function CourseContent({ params }: Pick<PageProps<"/teacher/courses/[courseId]">, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  const db = await createClient();
  const [detail, { data: examInfo }, tas, progress, policy] = await Promise.all([
    getCourseDetail(db, user.id, courseId),
    db.from("course_exam_info").select("topics, pattern, exam_date").eq("course_id", courseId).maybeSingle(),
    courseTas(db, courseId),
    setupProgress(db, courseId),
    coursePolicy(db, courseId),
  ]);
  if (!detail) notFound();
  const { course, assignments, roster } = detail;
  const syllabus = syllabusTopicsSchema.safeParse(examInfo?.topics ?? []).data ?? [];
  // S22: the guided setup checklist until every step is done.
  const steps = setupSteps(course.id, progress);
  const setupComplete = setupDone(steps) === steps.length;

  const newAssignment = (
    <AssignmentDialog
      courseId={course.id}
      policy={policy}
      trigger={
        <Button>
          <Plus aria-hidden="true" />
          New assignment
        </Button>
      }
    />
  );

  return (
    <>
      <Link
        href="/teacher/courses"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        All courses
      </Link>
      <PageHeader
        eyebrow={course.code || "Course"}
        title={course.name}
        description={`${course.students} ${course.students === 1 ? "student" : "students"} · ${course.assignments} ${course.assignments === 1 ? "assignment" : "assignments"}`}
        actions={
          <>
            <Button asChild variant="outline">
              {/* S6's materials page (upload and search notes for Sage). */}
              <Link href="/teacher/materials">
                <FileText aria-hidden="true" />
                Notes and PDFs
              </Link>
            </Button>
            <Button asChild variant="outline">
              {/* S21: questions students sent from Sage. */}
              <Link href={`/teacher/doubts?course=${course.id}`}>
                <HandHelping aria-hidden="true" />
                Doubts
              </Link>
            </Button>
            <Button asChild variant="outline">
              {/* Chat with Sage as a student would; previews never count in any number. */}
              <Link href={`/teacher/courses/${course.id}/preview`}>
                <MessagesSquare aria-hidden="true" />
                Preview Sage
              </Link>
            </Button>
            <CourseDialog
              course={course}
              trigger={
                <Button variant="outline">
                  <Pencil aria-hidden="true" />
                  Edit course
                </Button>
              }
            />
            {newAssignment}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="grid content-start gap-6 lg:col-span-8">
          {setupComplete ? null : <SetupChecklist steps={steps} />}
          <section aria-labelledby="join-title" className="rounded-lg border bg-surface p-6">
            <h2 id="join-title" className="text-title">
              Join code
            </h2>
            <p className="mb-4 text-small text-muted-foreground">
              Students enter this code in SafeSight to join {course.name}.
            </p>
            <JoinCode courseId={course.id} code={course.joinCode} />
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <Button asChild variant="outline">
                <Link href={`/teacher/courses/${course.id}/students`}>
                  <UserPlus aria-hidden="true" />
                  Import class list
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/teacher/courses/${course.id}/setup`}>
                  <ListTree aria-hidden="true" />
                  Syllabus and topics
                </Link>
              </Button>
            </div>
          </section>

          <section aria-labelledby="exam-title" className="rounded-lg border bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="exam-title" className="text-title">
                  Exam prep
                </h2>
                <p className="text-small text-muted-foreground">
                  Students make their own revision plans and mock tests. Publish the syllabus and pattern to steer them.
                </p>
              </div>
              <ExamInfoDialog
                courseId={course.id}
                topicsText={syllabusText(syllabus)}
                pattern={examInfo?.pattern ?? ""}
                examDate={examInfo?.exam_date ?? null}
                trigger={
                  <Button variant="outline">
                    <CalendarCheck aria-hidden="true" />
                    {examInfo ? "Edit syllabus and pattern" : "Add syllabus and pattern"}
                  </Button>
                }
              />
            </div>
            <dl className="mt-4 grid gap-3 text-small sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Syllabus topics</dt>
                <dd className="mt-0.5">
                  {syllabus.length ? <span className="font-mono">{syllabus.length}</span> : "None yet — plans use your notes"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Exam pattern</dt>
                <dd className="mt-0.5 line-clamp-2">{examInfo?.pattern || "Not given"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Exam date</dt>
                <dd className="mt-0.5">{examInfo?.exam_date ? formatShortDate(examInfo.exam_date) : "Not set"}</dd>
              </div>
            </dl>
          </section>

          <CourseTas courseId={course.id} tas={tas} />

          <section aria-labelledby="assignments-title">
            <h2 id="assignments-title" className="mb-4 text-title">
              Assignments
            </h2>
            {assignments.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No assignments yet"
                description="Create one and choose Learn, Assist or Exam to set how Sage may help."
                action={newAssignment}
              />
            ) : (
              <ul className="grid gap-3">
                {assignments.map((a) => (
                  <li key={a.id} className="flex flex-col gap-3 rounded-lg border bg-surface p-5 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-label">{a.title}</h3>
                        <ModeBadge mode={a.aiMode} withHint />
                      </div>
                      <p className="mt-1 text-small text-muted-foreground">
                        {a.dueAt ? `Due ${formatDateTime(a.dueAt)}` : "No due date"}
                      </p>
                      {a.instructions ? (
                        <p className="mt-2 line-clamp-2 text-small text-muted-foreground">{a.instructions}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          href={`/teacher/courses/${course.id}/preview?assignment=${a.id}`}
                          aria-label={`Preview Sage on ${a.title}`}
                          title="Preview Sage"
                        >
                          <MessagesSquare aria-hidden="true" />
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          href={`/teacher/courses/${course.id}/assignments/${a.id}/numbers`}
                          aria-label={`Per-student numbers for ${a.title}`}
                          title="Per-student numbers"
                        >
                          <Variable aria-hidden="true" />
                        </Link>
                      </Button>
                      <AssignmentDialog
                        courseId={course.id}
                        assignment={a}
                        policy={policy}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={`Edit ${a.title}`}>
                            <Pencil aria-hidden="true" />
                          </Button>
                        }
                      />
                      <DeleteAssignment courseId={course.id} assignment={a} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="roster-title" className="rounded-lg border bg-surface p-6 lg:col-span-4 lg:self-start">
          <h2 id="roster-title" className="mb-4 text-title">
            Students
          </h2>
          {roster.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center">
              <Users className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              <p className="text-small text-muted-foreground">Share the join code and students appear here.</p>
            </div>
          ) : (
            <ul className="-mx-2 grid">
              {roster.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/teacher/students/${s.id}`}
                    className="flex min-h-11 items-center rounded-sm px-2 transition-colors duration-150 ease-out hover:bg-hover"
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
