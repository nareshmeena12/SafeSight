import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { MockResults } from "@/components/exam/mock-results";
import { MockRunner, type MockItem } from "@/components/exam/mock-runner";
import { MockStatus } from "@/components/exam/mock-status";
import { requireRole } from "@/lib/auth/dal";
import { SAVE_GRACE_MS } from "@/lib/exam/grade";
import { optionsSchema } from "@/lib/learning/schemas";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mock test" };

export default function MockTestPage({ params }: PageProps<"/student/exam/mock/[testId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MockTest params={params} />
    </Suspense>
  );
}

/**
 * A mock test: running (timer and answers), being marked, or marked (score,
 * feedback and worked solutions). Read under row-level security: only the
 * student's own test comes back, and solutions exist on items only once it
 * has been marked.
 */
async function MockTest({ params }: Pick<PageProps<"/student/exam/mock/[testId]">, "params">) {
  await requireRole(["student"]);
  const { testId } = await params;
  if (!z.uuid().safeParse(testId).success) notFound();
  const db = await createClient();
  const [{ data: test }, { data: rows }] = await Promise.all([
    db
      .from("mock_tests")
      .select("id, plan_id, course_id, title, topics, minutes, started_at, ends_at, submitted_at, graded_at, marks, max_marks, score")
      .eq("id", testId)
      .maybeSingle(),
    db
      .from("mock_test_items")
      .select("id, position, kind, format, topic, question, options, marks, answer, choice, score, verdict, feedback, solution")
      .eq("test_id", testId)
      .order("position"),
  ]);
  if (!test) notFound();
  const items = (rows ?? []).map((r) => ({
    ...r,
    kind: r.kind as MockItem["kind"],
    format: r.format as MockItem["format"],
    options: r.options ? (optionsSchema.safeParse(r.options).data ?? null) : null,
  }));
  const now = new Date().getTime();
  const running = !test.submitted_at && now <= Date.parse(test.ends_at) + SAVE_GRACE_MS;
  const back = test.plan_id ? { href: `/student/exam/${test.plan_id}`, label: "Revision plan" } : { href: "/student/exam", label: "Exam prep" };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href={back.href} className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        {back.label}
      </Link>
      <PageHeader
        className="mb-6 lg:mb-8"
        eyebrow="Mock test · practice only"
        title={test.title}
        description={
          running
            ? `${items.length} questions, ${test.minutes} minutes. Not an assignment and not graded — your teacher doesn't see it. Work it like the real exam: no notes, no Sage.`
            : `${items.length} questions on ${(Array.isArray(test.topics) ? test.topics : []).join(", ")}. Practice only — your teacher doesn't see it.`
        }
      />
      {running ? (
        <MockRunner testId={test.id} endsAt={test.ends_at} serverNow={now} items={items} />
      ) : !test.graded_at ? (
        <section aria-live="polite" className="rounded-lg border bg-surface p-6">
          <h2 className="text-title">{test.submitted_at ? "Marking your test…" : "Time's up"}</h2>
          <p className="mt-1 text-small text-muted-foreground">
            {test.submitted_at
              ? "Sage is checking your answers. This page updates by itself in a few seconds."
              : "Your saved answers are being handed in and marked now."}
          </p>
          <MockStatus testId={test.id} mode={test.submitted_at ? "marking" : "expired"} />
        </section>
      ) : (
        <MockResults
          test={{ planId: test.plan_id, courseId: test.course_id, marks: test.marks, maxMarks: test.max_marks, score: test.score }}
          items={items}
        />
      )}
    </div>
  );
}
