import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClipboardList, ListTree } from "lucide-react";
import { z } from "zod";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { AssignmentMapping } from "@/components/accreditation/assignment-mapping";
import { AttainmentSettingsForm } from "@/components/accreditation/attainment-settings";
import { NewTest, TestCard } from "@/components/accreditation/test-card";
import { TopicOutcomes } from "@/components/accreditation/topic-outcomes";
import { EmptyState } from "@/components/product/empty-state";
import { requireRole } from "@/lib/auth/dal";
import { accreditationCourse, marksSummary, readCourseAccreditation, readMarks } from "@/lib/accreditation/data";
import { createClient } from "@/lib/supabase/server";
import { OutcomesHeader } from "../shared";

export const metadata: Metadata = { title: "Assessments for COs" };

export default function AssessmentsPage({ params }: PageProps<"/teacher/courses/[courseId]/outcomes/assessments">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AssessmentsContent params={params} />
    </Suspense>
  );
}

async function AssessmentsContent({ params }: Pick<PageProps<"/teacher/courses/[courseId]/outcomes/assessments">, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  const db = await createClient();
  const course = await accreditationCourse(db, user.id, courseId);
  if (!course) notFound();
  const [data, marks, roster, invites, feedback, numberSets] = await Promise.all([
    readCourseAccreditation(db, course),
    readMarks(db, course.id),
    db.from("enrollments").select("student_id, student:profiles(full_name, roll_number)").eq("course_id", course.id),
    db.from("course_invites").select("email, student_id").eq("course_id", course.id),
    db.from("assignments").select("id, rubric").eq("course_id", course.id),
    db.from("assignment_number_sets").select("assignment_id, assignment:assignments!inner(course_id)").eq("assignments.course_id", course.id),
  ]);
  const summary = marksSummary(marks);
  const emailOf = new Map((invites.data ?? []).filter((i) => i.student_id).map((i) => [i.student_id!, i.email]));
  const rosterEntries = (roster.data ?? [])
    .map((r) => {
      const s = Array.isArray(r.student) ? r.student[0] : r.student;
      return { rollNumber: s?.roll_number ?? null, email: s?.roll_number ? "" : (emailOf.get(r.student_id) ?? ""), name: s?.full_name ?? "" };
    })
    .sort((a, b) => (a.rollNumber ?? "~").localeCompare(b.rollNumber ?? "~") || a.name.localeCompare(b.name));
  const hasRubric = new Set((feedback.data ?? []).filter((a) => a.rubric.trim()).map((a) => a.id));
  const hasNumbers = new Set((numberSets.data ?? []).map((s) => s.assignment_id));
  const { outcomes } = data;

  return (
    <>
      <OutcomesHeader course={course} active="assessments" />
      {!outcomes.length ? (
        <EmptyState
          icon={ListTree}
          title="Add course outcomes first"
          description="Assessments are mapped to COs, so the course needs its outcomes before anything can count."
          action={
            <Link href={`/teacher/courses/${course.id}/outcomes`} className="text-primary underline-offset-4 hover:underline">
              Add course outcomes
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="grid min-w-0 content-start gap-8 lg:col-span-8">
            <section aria-labelledby="tests-title" className="grid gap-4">
              <div>
                <h2 id="tests-title" className="text-title">
                  Tests and exams
                </h2>
                <p className="text-small text-muted-foreground">
                  Internal tests, end-semester exams, lab tests: add the questions with their marks and COs, then import the marks from your spreadsheet.
                </p>
              </div>
              {data.tests.length ? (
                <ul className="grid gap-3">
                  {data.tests.map((t) => (
                    <TestCard key={t.id} courseId={course.id} test={t} outcomes={outcomes} marks={summary[t.id]} roster={rosterEntries} />
                  ))}
                </ul>
              ) : null}
              <NewTest courseId={course.id} outcomes={outcomes} roster={rosterEntries} />
            </section>

            <section aria-labelledby="assignments-title" className="grid gap-4">
              <div>
                <h2 id="assignments-title" className="text-title">
                  Assignments in SafeSight
                </h2>
                <p className="text-small text-muted-foreground">
                  Marks come from your approved feedback on submitted work (rubric points), or from the per-student number check.
                </p>
              </div>
              {data.assignments.length ? (
                <ul className="grid gap-3">
                  {data.assignments.map((a) => (
                    <AssignmentMapping
                      key={a.id}
                      courseId={course.id}
                      assignment={a}
                      outcomes={outcomes}
                      marksNote={
                        hasRubric.has(a.id)
                          ? "Marks from approved feedback on its rubric."
                          : hasNumbers.has(a.id)
                            ? "Marks from the per-student number check."
                            : "No rubric with marks or number check yet: add a rubric like “Method (10)” so feedback carries marks."
                      }
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState icon={ClipboardList} title="No assignments yet" description="Assignments you create in this course can count towards COs." />
              )}
            </section>
          </div>

          <div className="grid min-w-0 content-start gap-6 lg:col-span-4">
            <section aria-labelledby="settings-title" className="rounded-lg border bg-surface p-6">
              <h2 id="settings-title" className="text-title">
                Thresholds and weights
              </h2>
              <p className="mb-4 text-small text-muted-foreground">
                {data.hasSettings ? "Used for this course's report." : "The usual defaults; change them to match your university's rules."}
              </p>
              <AttainmentSettingsForm courseId={course.id} settings={data.settings} />
            </section>

            <section aria-labelledby="topics-title" className="rounded-lg border bg-surface p-6">
              <h2 id="topics-title" className="text-title">
                Topics and COs
              </h2>
              <p className="mb-4 text-small text-muted-foreground">
                Students&apos; own practice and mock tests on these topics count towards the CO, as class totals only (3 or more students).
              </p>
              {data.topics.length ? (
                <TopicOutcomes courseId={course.id} topics={data.topics} outcomes={outcomes} pairs={data.topicOutcomes} />
              ) : (
                <p className="text-small text-muted-foreground">
                  No topic map yet.{" "}
                  <Link href={`/teacher/courses/${course.id}/setup`} className="text-primary underline-offset-4 hover:underline">
                    Add the syllabus topics
                  </Link>{" "}
                  to map them.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
