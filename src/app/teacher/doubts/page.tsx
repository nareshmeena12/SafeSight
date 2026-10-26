import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HandHelping } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { DoubtQueue, StatusTabs } from "@/components/doubts/doubt-queue";
import { TaOverviewPanel } from "@/components/doubts/ta-overview";
import { EmptyState } from "@/components/product/empty-state";
import { requireRole } from "@/lib/auth/dal";
import { courseDoubts, openCounts, staffCourses, taOverview } from "@/lib/doubts/data";
import { DOUBT_STATUSES, type DoubtStatus } from "@/lib/doubts/schemas";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Doubts" };

/**
 * S21: questions students sent from Sage ("Ask your teacher"), for the
 * courses this teacher teaches or assists (?course=, ?status=).
 */
export default function DoubtsPage({ searchParams }: PageProps<"/teacher/doubts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Doubts searchParams={searchParams} />
    </Suspense>
  );
}

async function Doubts({ searchParams }: { searchParams: PageProps<"/teacher/doubts">["searchParams"] }) {
  const user = await requireRole(["teacher", "admin"]);
  const { course: askedCourse, status: askedStatus } = await searchParams;
  const supabase = await createClient();
  const courses = await staffCourses(supabase, user.id);
  const status: DoubtStatus | "all" =
    askedStatus === "all" || DOUBT_STATUSES.includes(askedStatus as DoubtStatus) ? (askedStatus as DoubtStatus | "all") : "open";
  const selected =
    typeof askedCourse === "string" && z.uuid().safeParse(askedCourse).success ? courses.find((c) => c.id === askedCourse) ?? null : null;
  const scope = selected ? [selected.id] : courses.map((c) => c.id);

  const [doubts, counts, overview] = await Promise.all([
    courseDoubts(supabase, scope, status),
    openCounts(supabase, courses.map((c) => c.id)),
    // A course this user assists (not teaches): show the TA overview too.
    selected?.role === "ta" ? taOverview(selected.id) : null,
  ]);
  const roles = new Map(courses.map((c) => [c.id, c.role]));
  const names = new Map(courses.map((c) => [c.id, c.code || c.name]));
  const waiting = [...counts.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        eyebrow="Ask a human"
        title="Doubts"
        description={
          waiting
            ? `${waiting} ${waiting === 1 ? "question is" : "questions are"} waiting for an answer.`
            : "Questions students send from Sage when they're still stuck. Answer one, or answer the class at once."
        }
      />
      {!courses.length ? (
        <EmptyState icon={HandHelping} title="No courses yet" description="Create a course and students can send you questions from Sage." />
      ) : (
        <div className="grid gap-6">
          {courses.length > 1 ? (
            <nav aria-label="Course" className="flex flex-wrap gap-2">
              {[{ id: "", label: "All courses", n: waiting }, ...courses.map((c) => ({ id: c.id, label: `${c.code || c.name}${c.role === "ta" ? " (TA)" : ""}`, n: counts.get(c.id) ?? 0 }))].map((c) => {
                const params = new URLSearchParams({ status, ...(c.id ? { course: c.id } : {}) });
                const active = (selected?.id ?? "") === c.id;
                return (
                  <Link
                    key={c.id || "all"}
                    href={`/teacher/doubts?${params.toString()}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-small transition-colors duration-150 ease-out hover:bg-hover",
                      active && "border-primary bg-primary-soft",
                    )}
                  >
                    {c.label}
                    {c.n ? <span className="font-mono text-mono text-muted-foreground">{c.n}</span> : null}
                  </Link>
                );
              })}
            </nav>
          ) : null}
          {overview ? <TaOverviewPanel overview={overview} /> : null}
          <StatusTabs
            basePath="/teacher/doubts"
            query={selected ? { course: selected.id } : {}}
            current={status}
            counts={{ open: selected ? (counts.get(selected.id) ?? 0) : waiting }}
          />
          <DoubtQueue doubts={doubts} roles={roles} courseNames={selected ? undefined : names} status={status} />
        </div>
      )}
    </>
  );
}
