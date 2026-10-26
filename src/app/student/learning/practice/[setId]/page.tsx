import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { PracticeRunner, type RunnerItem } from "@/components/learning/practice-runner";
import { Markdown } from "@/components/sage/markdown";
import { requireRole } from "@/lib/auth/dal";
import { optionsSchema } from "@/lib/learning/schemas";
import { topicKey } from "@/lib/learning/topics";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Practice" };

export default function PracticePage({ params }: PageProps<"/student/learning/practice/[setId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Practice params={params} />
    </Suspense>
  );
}

const eyebrow = { practice: "Practice", review: "Review before exam", refresher: "5-minute refresher" } as const;

/**
 * A practice, review or refresher set. Read under row-level security: only
 * the student's own set comes back, and worked solutions are only on items
 * they have already answered.
 */
async function Practice({ params }: Pick<PageProps<"/student/learning/practice/[setId]">, "params">) {
  const user = await requireRole(["student"]);
  const { setId } = await params;
  if (!z.uuid().safeParse(setId).success) notFound();
  const db = await createClient();
  const [{ data: set }, { data: rows }] = await Promise.all([
    db.from("practice_sets").select("id, kind, topic, skill, lesson, course_id, score, courses(name, code)").eq("id", setId).maybeSingle(),
    db
      .from("practice_items")
      .select("id, position, difficulty, format, question, options, topic, answer, choice, score, verdict, feedback, solution")
      .eq("set_id", setId)
      .order("position"),
  ]);
  if (!set) notFound();
  const masteryTopic = set.kind === "refresher" ? (set.skill ?? set.topic) : set.topic;
  const { data: mastery } =
    set.kind === "review"
      ? { data: null }
      : await db
          .from("topic_mastery")
          .select("mastery")
          .eq("student_id", user.id)
          .eq("course_id", set.course_id)
          .eq("topic_key", topicKey(masteryTopic))
          .maybeSingle();

  const items: RunnerItem[] = (rows ?? []).map((r) => ({
    ...r,
    difficulty: r.difficulty as RunnerItem["difficulty"],
    format: r.format as RunnerItem["format"],
    verdict: r.verdict as RunnerItem["verdict"],
    options: r.options ? (optionsSchema.safeParse(r.options).data ?? null) : null,
  }));
  const course = set.courses ? (set.courses.code ? `${set.courses.code} · ${set.courses.name}` : set.courses.name) : "";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/student/learning"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        My learning
      </Link>
      <PageHeader
        className="mb-6 lg:mb-8"
        eyebrow={`${eyebrow[set.kind]}${course ? ` · ${course}` : ""}`}
        title={set.kind === "refresher" ? (set.skill ?? set.topic) : set.kind === "review" ? "Review before your exam" : set.topic}
        description={
          set.kind === "refresher"
            ? `A basic skill behind ${set.topic}. Read this, then try the 2 quick checks.`
            : set.kind === "review"
              ? "Problems aimed at your mistake log and weaker topics. Practice only — nothing here is graded."
              : "Three new problems, easy to hard. Practice only — nothing here is graded or sent to your teacher."
        }
      />
      {set.lesson ? (
        <section aria-label="Refresher" className="mb-4 rounded-lg border bg-surface p-4 sm:p-6">
          <Markdown>{set.lesson}</Markdown>
        </section>
      ) : null}
      <PracticeRunner
        setId={set.id}
        kind={set.kind}
        courseId={set.course_id}
        topic={masteryTopic}
        initialItems={items}
        initialScore={set.score}
        initialMastery={mastery?.mastery ?? null}
      />
    </div>
  );
}
