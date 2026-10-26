import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Network } from "lucide-react";
import { z } from "zod";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { CoPoMatrix } from "@/components/accreditation/co-po-matrix";
import { CourseOutcomesEditor } from "@/components/accreditation/course-outcomes-editor";
import { ProgramLink } from "@/components/accreditation/program-link";
import { aiStatus } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/dal";
import { accreditationCourse, listPrograms, readCourseAccreditation } from "@/lib/accreditation/data";
import { createClient } from "@/lib/supabase/server";
import { OutcomesHeader } from "./shared";

export const metadata: Metadata = { title: "Outcomes and mapping" };

export default function CourseOutcomesPage({ params }: PageProps<"/teacher/courses/[courseId]/outcomes">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OutcomesContent params={params} />
    </Suspense>
  );
}

async function OutcomesContent({ params }: Pick<PageProps<"/teacher/courses/[courseId]/outcomes">, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  const db = await createClient();
  const course = await accreditationCourse(db, user.id, courseId);
  if (!course) notFound();
  const [data, programs] = await Promise.all([readCourseAccreditation(db, course), listPrograms(db)]);
  const { outcomes, program, programOutcomes, mappings } = data;

  return (
    <>
      <OutcomesHeader course={course} active="outcomes" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <section aria-labelledby="cos-title" className="min-w-0 rounded-lg border bg-surface p-6 lg:col-span-7">
          <h2 id="cos-title" className="text-title">
            Course outcomes
          </h2>
          <p className="mb-4 text-small text-muted-foreground">
            What students can do by the end of the course. The same list as on{" "}
            <Link href={`/teacher/courses/${course.id}/setup`} className="text-primary underline-offset-4 hover:underline">
              Syllabus and topics
            </Link>
            .
          </p>
          <CourseOutcomesEditor courseId={course.id} outcomes={outcomes} />
        </section>

        <section aria-labelledby="program-title" className="min-w-0 rounded-lg border bg-surface p-6 lg:col-span-5 lg:self-start">
          <h2 id="program-title" className="text-title">
            Programme
          </h2>
          <p className="mb-4 text-small text-muted-foreground">The degree programme whose POs and PSOs this course maps to.</p>
          <ProgramLink
            courseId={course.id}
            current={program?.id ?? null}
            programs={programs.map((p) => ({ id: p.id, label: p.department ? `${p.name} (${p.department})` : p.name }))}
            hasMappings={mappings.length > 0}
          />
          {program ? (
            <Link
              href={`/teacher/accreditation/programs/${program.id}`}
              className="mt-2 inline-flex min-h-11 items-center gap-1 text-small text-primary underline-offset-4 hover:underline"
            >
              {programOutcomes.length} outcomes in {program.name}
              <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          ) : null}
        </section>

        <section aria-labelledby="matrix-title" className="min-w-0 rounded-lg border bg-surface p-6 lg:col-span-12">
          <h2 id="matrix-title" className="text-title">
            CO–PO mapping
          </h2>
          <p className="mb-4 text-small text-muted-foreground">
            How strongly each course outcome supports each programme outcome. The PO attainment in the report is weighted by these levels.
          </p>
          {!outcomes.length || !program || !programOutcomes.length ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center">
              <Network className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              <p className="max-w-md text-small text-muted-foreground">
                {!outcomes.length
                  ? "Add the course outcomes first."
                  : !program
                    ? "Link the course to a programme to map its outcomes."
                    : "This programme has no POs yet. Add them on the programme page."}
              </p>
            </div>
          ) : (
            <CoPoMatrix
              courseId={course.id}
              outcomes={outcomes}
              programOutcomes={programOutcomes}
              mappings={mappings}
              aiReady={aiStatus().chat}
            />
          )}
        </section>
      </div>
    </>
  );
}
