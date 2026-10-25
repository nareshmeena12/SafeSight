import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Variable } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { CheckBadge } from "@/components/numbers/check-badge";
import { NumberSetForm } from "@/components/numbers/number-set-form";
import { EmptyState } from "@/components/product/empty-state";
import { ModeBadge } from "@/components/product/mode-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/dal";
import { removeNumberSet } from "@/lib/numbers/actions";
import { getClassNumbers } from "@/lib/numbers/data";
import { formatNumber } from "@/lib/numbers/numbers";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const metadata: Metadata = { title: "Per-student numbers" };

type Props = PageProps<"/teacher/courses/[courseId]/assignments/[assignmentId]/numbers">;

export default function NumbersPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NumbersContent params={params} />
    </Suspense>
  );
}

async function NumbersContent({ params }: Pick<Props, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const { courseId, assignmentId } = await params;
  if (!z.uuid().safeParse(courseId).success || !z.uuid().safeParse(assignmentId).success) notFound();
  const data = await getClassNumbers(await createClient(), user.id, assignmentId);
  if (!data || data.course.id !== courseId) notFound();
  const { assignment, course, set, rows } = data;

  const answered = rows.filter((r) => r.answer).length;
  const matching = rows.filter((r) => r.result === "within").length;

  return (
    <>
      <Link
        href={`/teacher/courses/${course.id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        {course.code || course.name}
      </Link>
      <PageHeader
        eyebrow="Per-student numbers"
        title={assignment.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>Each student solves the same problem with their own values, and their answer is checked for you.</span>
            <ModeBadge mode={assignment.ai_mode} />
          </span>
        }
      />

      <div className="grid gap-8">
        <section aria-labelledby="setup-title" className="rounded-lg border bg-surface p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="setup-title" className="text-title">
                Variables and answer
              </h2>
              <p className="text-small text-muted-foreground">
                Sage works with each student&apos;s own values and never gives away their answer.
              </p>
            </div>
            {set ? (
              <form action={removeNumberSet}>
                <input type="hidden" name="assignmentId" value={assignment.id} />
                <Button type="submit" variant="outline">
                  Turn off
                </Button>
              </form>
            ) : null}
          </div>
          {user.role === "teacher" ? (
            <NumberSetForm courseId={course.id} assignmentId={assignment.id} set={set} />
          ) : (
            <p className="text-muted-foreground">Only the course teacher can change these.</p>
          )}
        </section>

        <section aria-labelledby="class-title" className="grid gap-4">
          <div>
            <h2 id="class-title" className="text-title">
              Class
            </h2>
            {set ? (
              <p className="text-small text-muted-foreground">
                <span className="font-mono text-mono">{answered}</span> of{" "}
                <span className="font-mono text-mono">{rows.length}</span> have given an answer;{" "}
                <span className="font-mono text-mono">{matching}</span> match within{" "}
                <span className="font-mono text-mono">{set.tolerancePct}%</span>. Values change if you edit the ranges.
              </p>
            ) : null}
          </div>
          {!set ? (
            <EmptyState
              icon={Variable}
              title="No per-student numbers yet"
              description="Add the problem's variables with ranges and a formula above. Each student's values and answer check show up here."
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Variable}
              title="No students yet"
              description="Share the course join code. Each student's values appear here as they join."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Their values</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead>Their answer</TableHead>
                    <TableHead>Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.studentId}>
                      <TableCell className="min-w-36">
                        <Link href={`/teacher/students/${r.studentId}`} className="hover:underline">
                          {r.name}
                        </Link>
                        {r.submittedAt ? <span className="block text-small text-muted-foreground">Work submitted</span> : null}
                      </TableCell>
                      <TableCell className="min-w-44 font-mono text-mono">
                        {set.variables.map((v) => (
                          <span key={v.name} className="block whitespace-nowrap">
                            {v.name} = {r.values[v.name].toFixed(v.decimals)}
                            {v.unit ? ` ${v.unit}` : ""}
                          </span>
                        ))}
                      </TableCell>
                      <TableCell className="text-right font-mono text-mono whitespace-nowrap">
                        {r.expected === null ? "—" : formatNumber(r.expected)}
                        {set.answerUnit && r.expected !== null ? ` ${set.answerUnit}` : ""}
                      </TableCell>
                      <TableCell className="min-w-28 font-mono text-mono">{r.answer?.text ?? "—"}</TableCell>
                      <TableCell>
                        <CheckBadge result={r.result} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
