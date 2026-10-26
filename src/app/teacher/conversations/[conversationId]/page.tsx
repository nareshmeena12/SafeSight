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
  const [conv, { data: photoRows }] = await Promise.all([
    getConversation(db, user.id, conversationId),
    // S21: photos of working sent in this chat (RLS: only when the chat is flagged or shared).
    db.from("sage_photos").select("id, message_id, deleted_at").eq("conversation_id", conversationId),
  ]);
  if (!conv) notFound();
  const photos = new Map((photoRows ?? []).map((p) => [p.message_id, p]));

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
                {photos.get(m.id) ? (
                  photos.get(m.id)!.deleted_at ? (
                    <p className="mb-2 text-small text-muted-foreground">Photo of working (removed after 30 days)</p>
                  ) : (
                    <a href={`/api/sage/photo/${photos.get(m.id)!.id}`} target="_blank" rel="noreferrer" className="mb-2 block w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed image */}
                      <img
                        src={`/api/sage/photo/${photos.get(m.id)!.id}`}
                        alt={`Photo of ${conv.student.name}'s working`}
                        loading="lazy"
                        className="h-32 max-w-full rounded-md border object-cover"
                      />
                    </a>
                  )
                ) : null}
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
