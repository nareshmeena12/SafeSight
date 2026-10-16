import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, MessageSquareDashed } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { FlagList } from "@/components/teacher/flag-list";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/teacher/dates";
import { getConversation } from "@/lib/teacher/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

// The app shell's NavLinks reads usePathname() outside Suspense, which fails the
// build for routes with dynamic params; render on request (same as S9's pages).
export const instant = false;

export default function ConversationPage({ params }: PageProps<"/teacher/conversations/[conversationId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConversationContent params={params} />
    </Suspense>
  );
}

async function ConversationContent({
  params,
}: Pick<PageProps<"/teacher/conversations/[conversationId]">, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const { conversationId } = await params;
  if (!z.uuid().safeParse(conversationId).success) notFound();
  const db = await createClient();
  const conv = await getConversation(db, user.id, conversationId);
  if (!conv) notFound();

  return (
    <>
      <Link
        href={`/teacher/students/${conv.student.id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        {conv.student.name}
      </Link>
      <PageHeader
        eyebrow={conv.shared ? "Shared chat" : "Flagged chat"}
        title={conv.assignmentTitle ?? "Sage chat"}
        description={`${conv.student.name} · started ${formatDateTime(conv.startedAt)}`}
      />

      {conv.flags.length > 0 ? (
        <section aria-labelledby="chat-flags" className="mb-8">
          <h2 id="chat-flags" className="sr-only">
            Flags on this chat
          </h2>
          <FlagList flags={conv.flags} showStudent={false} conversationFor={{}} />
        </section>
      ) : null}

      {conv.messages.length === 0 ? (
        <EmptyState
          icon={MessageSquareDashed}
          title="This chat is private"
          description="You see a chat only when a message in it is flagged in your course or the student shares it with you."
        />
      ) : (
        <ol className="mx-auto grid max-w-3xl gap-4" aria-label="Messages">
          {conv.messages.map((m) => (
            <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-lg border px-4 py-3",
                  m.role === "user" ? "bg-primary-soft" : "bg-surface",
                  m.flagged && "border-insight bg-insight-soft",
                )}
              >
                <p className="mb-1 text-small text-muted-foreground">
                  {m.role === "user" ? conv.student.name : "Sage"} · {formatDateTime(m.createdAt)}
                  {m.flagged ? <span className="ml-2 font-medium text-foreground">Flagged</span> : null}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
