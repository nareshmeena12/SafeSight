import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { LiveQuiz } from "@/components/brief/live-quiz";
import { requireRole } from "@/lib/auth/dal";
import { teacherQuizView } from "@/lib/brief/quiz";
import { quizSessionIdSchema } from "@/lib/brief/quiz-schema";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/teacher/dates";

export const metadata: Metadata = { title: "Live quiz" };

export default function LiveQuizPage({ params }: PageProps<"/teacher/brief/quiz/[sessionId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LiveQuizContent params={params} />
    </Suspense>
  );
}

async function LiveQuizContent({ params }: Pick<PageProps<"/teacher/brief/quiz/[sessionId]">, "params">) {
  await requireRole(["teacher", "admin"]);
  const id = quizSessionIdSchema.safeParse((await params).sessionId);
  if (!id.success) notFound();
  const view = await teacherQuizView(await createClient(), id.data);
  if (!view) notFound();
  const host = (await headers()).get("host") ?? new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").host;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/teacher/brief?course=${view.courseId}`} className="inline-flex min-h-11 items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            Brief
          </Link>
        }
        title={view.open ? "Live quiz" : "Quiz results"}
        description={`Started ${formatDateTime(view.createdAt)}. ${view.open ? "Results update every few seconds." : "This quiz is closed."}`}
      />
      <LiveQuiz initial={view} joinUrl={`${host}/quiz`} />
    </>
  );
}
