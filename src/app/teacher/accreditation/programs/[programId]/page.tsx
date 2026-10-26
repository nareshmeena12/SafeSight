import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Layers } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { DraftNotice } from "@/components/accreditation/attainment-report";
import { ExportButtons } from "@/components/accreditation/export-buttons";
import { ProgramEditor } from "@/components/accreditation/program-editor";
import { EmptyState } from "@/components/product/empty-state";
import { requireRole } from "@/lib/auth/dal";
import { formatValue, programAttainment } from "@/lib/accreditation/attainment";
import { canManageProgram, myInstitutionId, programAttainmentData, readProgram } from "@/lib/accreditation/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Programme" };

export default function ProgramPage({ params }: PageProps<"/teacher/accreditation/programs/[programId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProgramContent params={params} />
    </Suspense>
  );
}

async function ProgramContent({ params }: Pick<PageProps<"/teacher/accreditation/programs/[programId]">, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const { programId } = await params;
  if (!z.uuid().safeParse(programId).success) notFound();
  const db = await createClient();
  // RLS decides who may see the programme; only then are its courses read (aggregates only).
  const read = await readProgram(db, programId);
  if (!read) notFound();
  const { program, outcomes } = read;
  const [rows, institutionId] = await Promise.all([programAttainmentData(program.id, user.id), myInstitutionId(db, user.id)]);
  const results = programAttainment(
    outcomes,
    rows.map((r) => ({ courseId: r.courseId, label: r.label, values: r.values })),
  );
  const manage = canManageProgram(program, user, institutionId);

  return (
    <>
      <Link href="/teacher/accreditation" className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Accreditation
      </Link>
      <PageHeader
        eyebrow={program.department || "Programme"}
        title={program.name}
        description={`${outcomes.filter((o) => o.kind === "po").length} POs · ${outcomes.filter((o) => o.kind === "pso").length} PSOs · ${rows.length} ${rows.length === 1 ? "course" : "courses"}`}
        actions={<ExportButtons href={`/api/accreditation/programs/${program.id}/export`} disabled={!outcomes.length} />}
      />
      <div className="grid gap-8">
        <DraftNotice />

        <section aria-labelledby="attainment-title" className="grid gap-4">
          <div>
            <h2 id="attainment-title" className="text-title">
              PO attainment by course
            </h2>
            <p className="text-small text-muted-foreground">
              Each course: Σ(mapping × CO level) ÷ Σ(mapping), 0–3. The programme row is the mean of the courses with a value.
            </p>
          </div>
          {rows.length && outcomes.length ? (
            <div className="overflow-x-auto rounded-lg border bg-surface">
              <table className="w-full min-w-max text-small">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="sticky left-0 bg-surface px-4 py-3 text-left font-medium">
                      Course
                    </th>
                    {outcomes.map((o) => (
                      <th key={o.id} scope="col" className="px-2 py-3 text-center font-mono font-medium" title={o.title || o.description}>
                        {o.code}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.courseId} className="border-b">
                      <th scope="row" className="sticky left-0 max-w-56 bg-surface px-4 py-3 text-left font-normal">
                        {r.mine ? (
                          <Link href={`/teacher/courses/${r.courseId}/outcomes/report`} className="text-primary underline-offset-4 hover:underline">
                            {r.label}
                          </Link>
                        ) : (
                          r.label
                        )}
                        <span className="block text-muted-foreground">{r.teacher}</span>
                      </th>
                      {outcomes.map((o) => (
                        <td key={o.id} className="px-2 py-3 text-center font-mono">
                          {r.values[o.id] == null ? "–" : formatValue(r.values[o.id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-hover font-medium">
                    <th scope="row" className="sticky left-0 bg-surface px-4 py-3 text-left font-medium">
                      Programme
                    </th>
                    {results.map((p) => (
                      <td key={p.outcome.id} className="px-2 py-3 text-center font-mono">
                        {p.value === null ? "–" : formatValue(p.value)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Layers}
              title={outcomes.length ? "No courses linked yet" : "Add the programme outcomes first"}
              description={
                outcomes.length
                  ? "Teachers link a course on its Outcomes and attainment page; its PO attainment shows here."
                  : "Courses map their COs to these outcomes."
              }
            />
          )}
          {rows.length && outcomes.length ? (
            <details className="rounded-lg border bg-surface p-5">
              <summary className="min-h-6 cursor-pointer text-label">How each programme value was computed</summary>
              <ul className="mt-3 grid gap-2 text-small">
                {results.map((p) => (
                  <li key={p.outcome.id} className="grid gap-1 sm:grid-cols-[5rem_1fr]">
                    <span className="font-mono text-primary">{p.outcome.code}</span>
                    <span className="text-muted-foreground">{p.formula}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        {rows.length ? (
          <section aria-labelledby="courses-title" className="grid gap-4">
            <h2 id="courses-title" className="text-title">
              Courses
            </h2>
            <ul className="divide-y rounded-lg border bg-surface">
              {rows.map((r) => (
                <li key={r.courseId} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block text-label">{r.label}</span>
                    <span className="text-small text-muted-foreground">{[r.teacher, r.academicYear].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                  <span className="font-mono text-small text-muted-foreground">
                    {r.assessed}/{r.outcomes} COs assessed · {r.met} at target · {r.mapped} mapped cells
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="pos-title" className="rounded-lg border bg-surface p-6">
          <h2 id="pos-title" className="text-title">
            Programme outcomes
          </h2>
          <p className="mb-4 text-small text-muted-foreground">
            {manage ? "You can change these: you made this programme or are an admin." : "Only the teacher who made this programme, or an admin, can change these."}
          </p>
          {manage ? (
            <ProgramEditor program={program} outcomes={outcomes} />
          ) : outcomes.length ? (
            <ol className="grid gap-3">
              {outcomes.map((o) => (
                <li key={o.id} className="grid gap-1 text-small sm:grid-cols-[5rem_1fr]">
                  <span className="font-mono text-primary">{o.code}</span>
                  <span>
                    {o.title ? <span className="font-medium">{o.title}: </span> : null}
                    {o.description}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-small text-muted-foreground">No outcomes yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
