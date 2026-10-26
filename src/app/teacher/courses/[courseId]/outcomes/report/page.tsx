import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BarChart3 } from "lucide-react";
import { z } from "zod";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { CoAttainmentList, DraftNotice, PoAttainmentTable, targetThreshold } from "@/components/accreditation/attainment-report";
import { ExportButtons } from "@/components/accreditation/export-buttons";
import { EmptyState } from "@/components/product/empty-state";
import { StatCard } from "@/components/product/stat-card";
import { requireRole } from "@/lib/auth/dal";
import { formatNumber } from "@/lib/accreditation/attainment";
import { accreditationCourse, courseAttainment } from "@/lib/accreditation/data";
import { methodLines } from "@/lib/accreditation/report";
import { createClient } from "@/lib/supabase/server";
import { OutcomesHeader } from "../shared";

export const metadata: Metadata = { title: "Attainment report" };

export default function ReportPage({ params }: PageProps<"/teacher/courses/[courseId]/outcomes/report">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportContent params={params} />
    </Suspense>
  );
}

async function ReportContent({ params }: Pick<PageProps<"/teacher/courses/[courseId]/outcomes/report">, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  const db = await createClient();
  const course = await accreditationCourse(db, user.id, courseId);
  if (!course) notFound();
  const { data, co, po } = await courseAttainment(db, course);
  const s = data.settings;
  const assessed = co.filter((c) => c.level !== null).length;
  const met = co.filter((c) => c.met).length;
  const href = `/api/accreditation/courses/${course.id}/export`;

  return (
    <>
      <OutcomesHeader course={course} active="report" actions={<ExportButtons href={href} disabled={!data.outcomes.length} />} />
      {!data.outcomes.length ? (
        <EmptyState
          icon={BarChart3}
          title="No course outcomes yet"
          description="Add the course outcomes and map assessments to them; the report fills in as marks come in."
          action={
            <Link href={`/teacher/courses/${course.id}/outcomes`} className="text-primary underline-offset-4 hover:underline">
              Add course outcomes
            </Link>
          }
        />
      ) : (
        <div className="grid gap-8">
          <DraftNotice />
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="COs assessed" value={`${assessed} of ${co.length}`} />
            <StatCard label={`COs at level ${formatNumber(s.targetLevel)} or above`} value={`${met} of ${co.length}`} />
            <StatCard label="Assessments counted" value={String(new Set(co.flatMap((c) => c.rows.filter((r) => r.counted).map((r) => r.assessmentId))).size)} />
          </div>

          <section aria-labelledby="co-title" className="grid gap-4">
            <div>
              <h2 id="co-title" className="text-title">
                Course outcome attainment
              </h2>
              <p className="text-small text-muted-foreground">
                Share of students who scored at least {formatNumber(s.targetPct)}% on each CO; the tick marks what the target level needs ({formatNumber(targetThreshold(s))}%). Open a CO to see
                every assessment behind it.
              </p>
            </div>
            {assessed === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-small text-muted-foreground">
                Nothing is assessed yet.{" "}
                <Link href={`/teacher/courses/${course.id}/outcomes/assessments`} className="text-primary underline-offset-4 hover:underline">
                  Map assignments or import test marks
                </Link>{" "}
                to fill this in.
              </p>
            ) : null}
            <CoAttainmentList results={co} settings={s} />
          </section>

          <section aria-labelledby="po-title" className="grid gap-4">
            <div>
              <h2 id="po-title" className="text-title">
                Programme outcome attainment from this course
              </h2>
              <p className="text-small text-muted-foreground">Σ(CO–PO mapping × CO level) ÷ Σ(mapping), on the 0–3 scale.</p>
            </div>
            {po.length ? (
              <PoAttainmentTable results={po} />
            ) : (
              <p className="rounded-md border border-dashed p-4 text-small text-muted-foreground">
                {data.program ? "The programme has no POs yet." : "Link the course to a programme and map its COs to see PO attainment."}{" "}
                <Link href={`/teacher/courses/${course.id}/outcomes`} className="text-primary underline-offset-4 hover:underline">
                  Outcomes and mapping
                </Link>
              </p>
            )}
          </section>

          <section aria-labelledby="method-title" className="rounded-lg border bg-surface p-6">
            <h2 id="method-title" className="mb-3 text-title">
              How the numbers are computed
            </h2>
            <ul className="grid list-disc gap-2 pl-5 text-small text-muted-foreground">
              {methodLines(s).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-4 text-small">
              <Link href={`/teacher/courses/${course.id}/outcomes/assessments#settings-title`} className="text-primary underline-offset-4 hover:underline">
                Change thresholds and weights
              </Link>
            </p>
          </section>
        </div>
      )}
    </>
  );
}
