import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { JoinQuizForm } from "@/components/brief/join-quiz-form";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Join a class quiz" };

export default function JoinQuizPage({ searchParams }: PageProps<"/student/quiz">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JoinQuiz searchParams={searchParams} />
    </Suspense>
  );
}

async function JoinQuiz({ searchParams }: Pick<PageProps<"/student/quiz">, "searchParams">) {
  await requireRole(["student"]);
  const code = (await searchParams).code;
  return (
    <>
      <PageHeader
        eyebrow="Class quiz"
        title="Join a class quiz"
        description="Type the 6-digit code your teacher shows. It's a quick check, not a test: your teacher sees how the class answered, not who chose what."
      />
      <JoinQuizForm initialCode={typeof code === "string" ? code : ""} />
    </>
  );
}
