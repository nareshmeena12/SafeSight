import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BookOpen, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { ProgramCreate } from "@/components/accreditation/program-create";
import { EmptyState } from "@/components/product/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/dal";
import { listPrograms } from "@/lib/accreditation/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Accreditation" };

export default function AccreditationPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AccreditationContent />
    </Suspense>
  );
}

async function AccreditationContent() {
  const user = await requireRole(["teacher", "admin"]);
  const db = await createClient();
  const [programs, { data: courses }] = await Promise.all([
    listPrograms(db),
    db.from("courses").select("id, name, code").eq("teacher_id", user.id).order("name"),
  ]);
  const ids = (courses ?? []).map((c) => c.id);
  const [links, outcomes, mappings, assessments] = ids.length
    ? await Promise.all([
        db.from("course_programs").select("course_id, program_id").in("course_id", ids),
        db.from("course_outcomes").select("course_id").in("course_id", ids),
        db.from("co_po_mappings").select("course_id").in("course_id", ids),
        db.from("course_assessments").select("course_id").in("course_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const count = (rows: { course_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.course_id === id).length;
  const programName = new Map(programs.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader
        eyebrow="Accreditation"
        title="NBA and NAAC reports"
        description="Course outcomes, CO–PO mapping and attainment from your assessments, with every number explained. Exports are drafts to check against your university's format."
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <section aria-labelledby="courses-title" className="grid min-w-0 content-start gap-4 lg:col-span-7">
          <div>
            <h2 id="courses-title" className="text-title">
              Your courses
            </h2>
            <p className="text-small text-muted-foreground">Open a course to set its COs, map them to POs and see its attainment.</p>
          </div>
          {courses?.length ? (
            <ul className="divide-y rounded-lg border bg-surface">
              {courses.map((c) => {
                const link = (links.data ?? []).find((l) => l.course_id === c.id);
                const cos = count(outcomes.data, c.id);
                const cells = count(mappings.data, c.id);
                const tools = count(assessments.data, c.id);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/teacher/courses/${c.id}/outcomes`}
                      className="flex min-h-11 items-center gap-3 p-4 transition-colors duration-150 ease-out hover:bg-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-label">{c.code ? `${c.code} · ${c.name}` : c.name}</span>
                        <span className="mt-1 block text-small text-muted-foreground">
                          {[
                            link ? (programName.get(link.program_id) ?? "Programme") : "No programme",
                            `${cos} ${cos === 1 ? "CO" : "COs"}`,
                            `${cells} mapped ${cells === 1 ? "cell" : "cells"}`,
                            `${tools} ${tools === 1 ? "assessment" : "assessments"}`,
                          ].join(" · ")}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={BookOpen} title="No courses yet" description="Create a course first; its outcomes and reports live here." />
          )}
        </section>

        <section id="programmes" aria-labelledby="programmes-title" className="grid min-w-0 scroll-mt-24 content-start gap-4 lg:col-span-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="programmes-title" className="text-title">
                Programmes
              </h2>
              <p className="text-small text-muted-foreground">POs and PSOs per programme, shared with your institution&apos;s teachers.</p>
            </div>
            <ProgramCreate />
          </div>
          {programs.length ? (
            <ul className="grid gap-3">
              {programs.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/teacher/accreditation/programs/${p.id}`}
                    className="flex min-h-11 items-start gap-3 rounded-lg border bg-surface p-4 transition-colors duration-150 ease-out hover:bg-hover"
                  >
                    <GraduationCap className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-label">{p.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-small text-muted-foreground">
                        {p.department ? <span>{p.department}</span> : null}
                        <span className="font-mono">
                          {p.pos} POs · {p.psos} PSOs
                        </span>
                        {p.createdBy === user.id ? <Badge variant="secondary">Yours</Badge> : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={GraduationCap}
              title="No programmes yet"
              description="Add your programme (for example B.Tech Mechanical Engineering) with its POs, then link your courses to it."
            />
          )}
        </section>
      </div>
    </>
  );
}
