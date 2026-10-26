import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { StudentQuiz } from "@/components/brief/student-quiz";
import { requireRole } from "@/lib/auth/dal";
import { studentQuizView } from "@/lib/brief/quiz";
import { quizSessionIdSchema } from "@/lib/brief/quiz-schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Class quiz" };

export default function StudentQuizPage({ params }: PageProps<"/student/quiz/[sessionId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentQuizContent params={params} />
    </Suspense>
  );
}

async function StudentQuizContent({ params }: Pick<PageProps<"/student/quiz/[sessionId]">, "params">) {
  const user = await requireRole(["student"]);
  const id = quizSessionIdSchema.safeParse((await params).sessionId);
  if (!id.success) notFound();
  const view = await studentQuizView(await createClient(), user.id, id.data);
  if (!view) notFound();
  return (
    <>
      <PageHeader eyebrow={view.courseName} title="Class quiz" description={view.open ? "Five quick questions. Pick the best answer for each." : "Here are the answers."} />
      <StudentQuiz view={view} />
    </>
  );
}
