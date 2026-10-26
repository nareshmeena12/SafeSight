import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CheckCheck, HandHelping, Megaphone, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { DoubtStatusBadge } from "@/components/doubts/doubt-queue";
import { MarkNotificationsRead } from "@/components/doubts/mark-read";
import { EmptyState } from "@/components/product/empty-state";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { setDoubtStatus } from "@/lib/doubts/actions";
import { announcements, myDoubts, staffCourses, unreadNotifications } from "@/lib/doubts/data";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/teacher/dates";

export const metadata: Metadata = { title: "Doubts" };

/**
 * S21: the student's questions to their teachers and the answers, class
 * announcements, and — for teaching assistants — the courses they help with.
 */
export default function StudentDoubtsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentDoubts />
    </Suspense>
  );
}

async function StudentDoubts() {
  const user = await requireRole(["student"]);
  const supabase = await createClient();
  const [doubts, notices, assisting, { data: courses }] = await Promise.all([
    myDoubts(supabase, user.id),
    unreadNotifications(supabase, user.id),
    staffCourses(supabase, user.id),
    supabase.from("courses").select("id, name, code"),
  ]);
  // Announcements from the courses the student is enrolled in (RLS).
  const posts = await announcements(supabase);
  const courseName = new Map((courses ?? []).map((c) => [c.id, c.code || c.name]));
  // Answers that arrived since the oldest unread notice are marked "New answer".
  const answerNotices = notices.filter((n) => n.kind !== "ta_added").map((n) => Date.parse(n.created_at));
  const newSince = answerNotices.length ? Math.min(...answerNotices) - 60_000 : Infinity;
  const isNew = (d: { answeredAt: string | null }) => Boolean(d.answeredAt && Date.parse(d.answeredAt) >= newSince);

  return (
    <>
      <MarkNotificationsRead unread={notices.length} />
      <PageHeader
        title="Doubts"
        description="Questions you asked your teachers from Sage, and their answers. Only your teacher and the course's teaching assistants see your questions."
        actions={
          <Button asChild variant="secondary">
            <Link href="/student/sage">
              Ask Sage first
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="grid content-start gap-8 lg:col-span-8">
          <section aria-labelledby="mine-title">
            <h2 id="mine-title" className="mb-4 text-title">
              Your questions
            </h2>
            {doubts.length ? (
              <ul className="grid gap-4">
                {doubts.map((d) => (
                  <li key={d.id} className="rounded-lg border bg-surface p-5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <DoubtStatusBadge status={d.status} />
                      {isNew(d) && d.answer ? (
                        <span className="text-small font-medium text-primary">New answer</span>
                      ) : null}
                      <span className="text-small text-muted-foreground">
                        {[courseName.get(d.courseId), d.assignmentTitle ?? "Ask Sage", formatRelative(d.createdAt)].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words">{d.question}</p>
                    {d.answer ? (
                      <div className="mt-4 rounded-md bg-primary-soft px-4 py-3">
                        <p className="text-small text-muted-foreground">
                          {d.announcementId ? "Answered for the whole class" : "Answer"}
                          {d.answeredByName ? ` · ${d.answeredByName}` : ""}
                          {d.answeredAt ? ` · ${formatRelative(d.answeredAt)}` : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words">{d.answer}</p>
                      </div>
                    ) : (
                      <p className="mt-3 text-small text-muted-foreground">
                        Waiting for an answer. You&apos;ll be told here{d.chatShared ? " — you also shared the chat with your teacher" : ""}.
                      </p>
                    )}
                    <form action={setDoubtStatus} className="mt-3">
                      <input type="hidden" name="doubtId" value={d.id} />
                      <input type="hidden" name="status" value={d.status === "resolved" ? "open" : "resolved"} />
                      <Button type="submit" variant="ghost" size="sm">
                        {d.status === "resolved" ? <RotateCcw aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}
                        {d.status === "resolved" ? "I'm still stuck" : d.answer ? "That helped — mark resolved" : "I worked it out"}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={HandHelping}
                title="No questions yet"
                description="When you're still stuck after working with Sage, tap “Ask your teacher” in the chat. Sage writes up your question for you to check."
              />
            )}
          </section>
        </div>

        <div className="grid content-start gap-6 lg:col-span-4">
          {assisting.some((c) => c.role === "ta") ? (
            <section aria-labelledby="ta-title" className="rounded-lg border bg-surface p-5">
              <h2 id="ta-title" className="text-title">
                Courses you help with
              </h2>
              <p className="mb-3 text-small text-muted-foreground">You&apos;re a teaching assistant here.</p>
              <ul className="-mx-2 grid">
                {assisting
                  .filter((c) => c.role === "ta")
                  .map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/student/ta/${c.id}`}
                        className="flex min-h-11 items-center justify-between rounded-sm px-2 transition-colors duration-150 ease-out hover:bg-hover"
                      >
                        {c.code ? `${c.code} · ${c.name}` : c.name}
                        <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="posts-title" className="rounded-lg border bg-surface p-5">
            <h2 id="posts-title" className="flex items-center gap-2 text-title">
              <Megaphone className="size-5" strokeWidth={1.5} aria-hidden="true" />
              Class announcements
            </h2>
            {posts.length ? (
              <ul className="mt-3 grid gap-4">
                {posts.map((p) => (
                  <li key={p.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                    <p className="text-small text-muted-foreground">
                      {[courseName.get(p.courseId), p.createdByName, formatRelative(p.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                    <h3 className="mt-1 text-label">{p.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap break-words text-small">{p.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-small text-muted-foreground">
                When many classmates ask the same thing, your teacher may answer everyone here.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
