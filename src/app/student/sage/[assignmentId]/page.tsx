import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { SageChat } from "@/components/sage/sage-chat";
import { Button } from "@/components/ui/button";
import { aiStatus } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/dal";
import { careData } from "@/lib/sage/care";
import { citationsSchema, type SageUIMessage } from "@/lib/sage/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sage" };

export default function SagePage({ params }: PageProps<"/student/sage/[assignmentId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SageContent params={params} />
    </Suspense>
  );
}

async function SageContent({ params }: { params: PageProps<"/student/sage/[assignmentId]">["params"] }) {
  const user = await requireRole(["student"]);
  const { assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, instructions, ai_mode, due_at, courses!inner(name, code)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) notFound();

  // Pick up the latest chat for this assignment where the student left off.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("student_id", user.id)
    .eq("assignment_id", assignmentId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: rows } = conversation
    ? await supabase
        .from("messages")
        .select("id, role, content, intent, hint_level, citations")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .limit(200)
    : { data: [] };

  const care = careData();
  const initialMessages: SageUIMessage[] = (rows ?? []).map((m, i, all) => {
    const prev = all[i - 1];
    const afterDistress = m.role === "assistant" && prev?.role === "user" && prev.intent === "distress";
    const citations = citationsSchema.safeParse(m.citations);
    return {
      id: m.id,
      role: m.role,
      parts: [
        ...(afterDistress ? [{ type: "data-care" as const, id: "care", data: care }] : []),
        { type: "text" as const, text: m.content },
      ],
      metadata: { hintLevel: m.hint_level, citations: citations.success ? citations.data : [] },
    };
  });

  const course = assignment.courses;
  const due = assignment.due_at
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(
        new Date(assignment.due_at),
      )
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Button asChild variant="link" className="mb-4">
        <Link href="/student">
          <ArrowLeft aria-hidden="true" />
          Back to home
        </Link>
      </Button>
      <PageHeader
        className="mb-6 lg:mb-8"
        eyebrow={`${course.code ? `${course.code} · ` : ""}${course.name}`}
        title={assignment.title}
        description={
          <>
            {assignment.instructions || "Your teacher hasn't added instructions yet."}
            {due ? <span className="mt-1 block text-small">Due {due}</span> : null}
          </>
        }
      />
      <SageChat
        assignmentId={assignment.id}
        assignmentTitle={assignment.title}
        mode={assignment.ai_mode}
        studentFirstName={user.fullName.split(" ")[0] ?? ""}
        initialConversationId={conversation?.id ?? null}
        initialMessages={initialMessages}
        available={assignment.ai_mode === "exam" || aiStatus().chat}
      />
    </div>
  );
}
