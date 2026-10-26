import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { SageChat } from "@/components/sage/sage-chat";
import { aiStatus } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/dal";
import { loadChatMessages } from "@/lib/sage/ui-history";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ask Sage" };

/**
 * Explore ("Ask Sage"): a free chat for one course, not tied to an assignment.
 * Sage explains freely, but when a message matches an active assignment, that
 * assignment's rule applies (decided on the server, per message).
 */
export default function AskSagePage({ searchParams }: PageProps<"/student/sage">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AskSage searchParams={searchParams} />
    </Suspense>
  );
}

async function AskSage({ searchParams }: { searchParams: PageProps<"/student/sage">["searchParams"] }) {
  const user = await requireRole(["student"]);
  const { course: asked } = await searchParams;

  // Row-level security limits these to the student's own courses and chats.
  const supabase = await createClient();
  const { data: courses } = await supabase.from("courses").select("id, name, code").order("code");
  const list = courses ?? [];
  const selected =
    list.find((c) => typeof asked === "string" && z.uuid().safeParse(asked).success && c.id === asked) ?? list[0] ?? null;

  const header = (
    <PageHeader
      className="mb-6 lg:mb-8"
      eyebrow="Explore"
      title="Ask Sage"
      description="Ask about any idea from your courses. Sage explains it properly — and if a question is part of an assignment, it follows that assignment's rule."
    />
  );

  if (!selected) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {header}
        <EmptyState
          icon={BookOpen}
          title="Join a course first"
          description="Sage answers questions about your courses. Join one with your teacher's class code, then come back here."
        />
      </div>
    );
  }

  const [{ data: conversation }, { data: assignments }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", selected.id)
      .is("assignment_id", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("assignments").select("id, title, ai_mode").eq("course_id", selected.id),
  ]);
  const titles = new Map((assignments ?? []).map((a) => [a.id, { title: a.title, mode: a.ai_mode }]));
  const initialMessages = conversation ? await loadChatMessages(supabase, conversation.id, { assignments: titles }) : [];

  return (
    <div className="mx-auto w-full max-w-3xl">
      {header}
      {list.length > 1 ? (
        <nav aria-label="Course" className="mb-6 flex flex-wrap gap-2">
          {list.map((c) => {
            const active = c.id === selected.id;
            return (
              <Link
                key={c.id}
                href={`/student/sage?course=${c.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-label transition-colors duration-150 ease-out",
                  active ? "border-primary bg-primary-soft text-foreground" : "text-muted-foreground hover:bg-hover",
                )}
              >
                {c.code ? `${c.code} · ${c.name}` : c.name}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <SageChat
        key={selected.id}
        target={{ kind: "explore", courseId: selected.id, courseName: selected.code ? `${selected.code} ${selected.name}` : selected.name }}
        studentFirstName={user.fullName.split(" ")[0] ?? ""}
        initialConversationId={conversation?.id ?? null}
        initialMessages={initialMessages}
        available={aiStatus().chat}
        photos={aiStatus().vision}
        askTeacher
      />
    </div>
  );
}
