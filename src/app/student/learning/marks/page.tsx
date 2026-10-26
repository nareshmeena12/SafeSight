import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/dal";
import { formatNumber } from "@/lib/accreditation/attainment";
import { marksInOrder } from "@/lib/accreditation/marks";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Test marks" };

export default function MarksPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Marks />
    </Suspense>
  );
}

/**
 * Marks the student's teachers imported for tests and exams (S24), question
 * by question, with the course outcome each question assesses. Row-level
 * security returns only the student's own rows.
 */
async function Marks() {
  const user = await requireRole(["student"]);
  const db = await createClient();
  const [{ data: marks }, { data: tests }, { data: questions }, { data: outcomes }, { data: courses }] = await Promise.all([
    db.from("assessment_marks").select("assessment_id, marks, absent").eq("student_id", user.id),
    db.from("course_assessments").select("id, course_id, title, held_on").eq("kind", "test"),
    db.from("assessment_questions").select("id, assessment_id, label, max_marks, outcome_ids, position").order("position"),
    db.from("course_outcomes").select("id, code"),
    db.from("courses").select("id, name, code"),
  ]);
  const code = new Map((outcomes ?? []).map((o) => [o.id, o.code]));
  const courseName = new Map((courses ?? []).map((c) => [c.id, c.code ? `${c.code} · ${c.name}` : c.name]));
  const rows = (marks ?? []).flatMap((m) => {
    const test = (tests ?? []).find((t) => t.id === m.assessment_id);
    if (!test) return [];
    const qs = (questions ?? []).filter((q) => q.assessment_id === test.id);
    const values = marksInOrder(m.marks, qs);
    const got = values.reduce<number>((n, v) => n + (v ?? 0), 0);
    const max = qs.reduce((n, q, i) => n + (values[i] === null ? 0 : Number(q.max_marks)), 0);
    return [{ test, qs, values, absent: m.absent, got, max }];
  });
  rows.sort((a, b) => (b.test.held_on ?? "").localeCompare(a.test.held_on ?? ""));

  return (
    <>
      <Link href="/student/learning" className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        My learning
      </Link>
      <PageHeader eyebrow="My learning" title="Test marks" description="Marks your teachers added for tests and exams, question by question." />
      {rows.length ? (
        <ul className="grid gap-4">
          {rows.map(({ test, qs, values, absent, got, max }) => (
            <li key={test.id} className="min-w-0 rounded-lg border bg-surface p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-title">{test.title}</h2>
                  <p className="text-small text-muted-foreground">
                    {[courseName.get(test.course_id), test.held_on].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {absent ? (
                  <Badge variant="secondary">Marked absent</Badge>
                ) : (
                  <p className="font-mono text-title">
                    {formatNumber(got)}
                    <span className="text-muted-foreground"> / {formatNumber(max)}</span>
                  </p>
                )}
              </div>
              {!absent ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[20rem] text-small">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th scope="col" className="py-2 pr-3 font-medium">Question</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">Marks</th>
                        <th scope="col" className="py-2 font-medium">Course outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qs.map((q, i) => (
                        <tr key={q.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono">{q.label}</td>
                          <td className="py-2 pr-3 text-right font-mono">
                            {values[i] === null ? <span className="text-muted-foreground">not attempted</span> : `${formatNumber(values[i]!)} / ${formatNumber(Number(q.max_marks))}`}
                          </td>
                          <td className="py-2 font-mono text-muted-foreground">{q.outcome_ids.map((id) => code.get(id)).filter(Boolean).join(", ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ClipboardCheck}
          title="No test marks yet"
          description="When a teacher adds marks for a test or exam in one of your courses, they show here."
        />
      )}
    </>
  );
}
