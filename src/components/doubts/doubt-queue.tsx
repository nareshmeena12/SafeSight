import Link from "next/link";
import { CheckCheck, HandHelping, MessagesSquare, RotateCcw } from "lucide-react";
import { EmptyState } from "@/components/product/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setDoubtStatus } from "@/lib/doubts/actions";
import type { DoubtView } from "@/lib/doubts/data";
import type { DoubtStatus } from "@/lib/doubts/schemas";
import { groupSimilarDoubts, suggestedTitle } from "@/lib/doubts/similar";
import { formatRelative } from "@/lib/teacher/dates";
import { cn } from "@/lib/utils";
import { AnnounceDialog, AnswerForm } from "./doubt-actions";

const statusLabel: Record<DoubtStatus, string> = { open: "Waiting", answered: "Answered", resolved: "Resolved" };

export function DoubtStatusBadge({ status }: { status: DoubtStatus }) {
  return (
    <Badge variant={status === "open" ? "outline" : "secondary"} className={cn(status === "resolved" && "text-muted-foreground")}>
      {statusLabel[status]}
    </Badge>
  );
}

/** Status tabs that keep the rest of the query string (?course=…). */
export function StatusTabs({
  basePath,
  query,
  current,
  counts,
}: {
  basePath: string;
  query: Record<string, string>;
  current: DoubtStatus | "all";
  counts?: Partial<Record<DoubtStatus, number>>;
}) {
  const tabs: { value: DoubtStatus | "all"; label: string }[] = [
    { value: "open", label: "Waiting" },
    { value: "answered", label: "Answered" },
    { value: "resolved", label: "Resolved" },
    { value: "all", label: "All" },
  ];
  return (
    <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const params = new URLSearchParams({ ...query, status: t.value });
        const n = t.value !== "all" ? counts?.[t.value] : undefined;
        return (
          <Link
            key={t.value}
            href={`${basePath}?${params.toString()}`}
            aria-current={current === t.value ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-small transition-colors duration-150 ease-out hover:bg-hover",
              current === t.value && "border-primary bg-primary-soft text-foreground",
            )}
          >
            {t.label}
            {n ? <span className="font-mono text-mono">{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The doubts queue for a teacher or TA: groups of similar open questions
 * first (answer once for the class), then every doubt with its reply box.
 * TAs never get a link to the chat, even when it was shared with the teacher.
 */
export function DoubtQueue({
  doubts,
  roles,
  courseNames,
  status,
}: {
  doubts: DoubtView[];
  /** The viewer's role per course: teachers may open shared chats. */
  roles: Map<string, "teacher" | "ta">;
  /** Shown when the queue spans several courses. */
  courseNames?: Map<string, string>;
  status: DoubtStatus | "all";
}) {
  if (!doubts.length) {
    return (
      <EmptyState
        icon={HandHelping}
        title={status === "open" ? "No questions waiting" : "Nothing here yet"}
        description={
          status === "open"
            ? "When a student taps “Ask your teacher” in Sage, their question appears here with what they tried and where they're stuck."
            : "Questions you answer or resolve will show up here."
        }
      />
    );
  }

  const open = doubts.filter((d) => d.status === "open");
  // An announcement goes to one course, so similar questions are grouped per course.
  const sameCourse = [...new Set(open.map((d) => d.courseId))].flatMap((courseId) =>
    groupSimilarDoubts(
      open
        .filter((d) => d.courseId === courseId)
        .map((d) => ({ id: d.id, studentId: d.studentId, assignmentId: d.assignmentId, question: d.question, stuckOn: d.stuckOn })),
    ).map((g) => ({ ...g, courseId })),
  );

  return (
    <div className="grid gap-6">
      {sameCourse.length ? (
        <section aria-labelledby="similar-title" className="rounded-lg border bg-surface p-5">
          <h2 id="similar-title" className="text-title">
            Asked by several students
          </h2>
          <p className="mt-1 text-small text-muted-foreground">
            These questions look alike. One answer for the class saves time and helps students who didn&apos;t ask.
          </p>
          <ul className="mt-4 grid gap-3">
            {sameCourse.map((g) => {
              const members = open.filter((d) => g.ids.includes(d.id));
              return (
                <li key={g.ids.join()} className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-label">
                      <span className="font-mono text-mono">{g.students}</span> students
                      {g.words.length ? <> asked about {g.words.slice(0, 3).join(", ")}</> : <> asked something similar</>}
                    </p>
                    <p className="mt-1 line-clamp-2 text-small text-muted-foreground">“{members[0].question}”</p>
                  </div>
                  <AnnounceDialog
                    courseId={g.courseId}
                    doubtIds={g.ids}
                    students={g.students}
                    suggestedTitle={suggestedTitle(g)}
                    questions={members.map((m) => m.question)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <ul className="grid gap-4" aria-label="Questions">
        {doubts.map((d) => (
          <li key={d.id}>
            <article className="rounded-lg border bg-surface p-5" aria-labelledby={`doubt-${d.id}`}>
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 id={`doubt-${d.id}`} className="text-label">
                  {d.studentName || "A student"}
                </h3>
                <DoubtStatusBadge status={d.status} />
                <span className="text-small text-muted-foreground">
                  {[courseNames?.get(d.courseId), d.assignmentTitle ?? "Ask Sage", formatRelative(d.createdAt)].filter(Boolean).join(" · ")}
                </span>
              </header>
              <dl className="mt-3 grid gap-3">
                <div>
                  <dt className="text-small text-muted-foreground">Question</dt>
                  <dd className="whitespace-pre-wrap break-words">{d.question}</dd>
                </div>
                {d.tried ? (
                  <div>
                    <dt className="text-small text-muted-foreground">What they tried</dt>
                    <dd className="whitespace-pre-wrap break-words">{d.tried}</dd>
                  </div>
                ) : null}
                {d.stuckOn ? (
                  <div>
                    <dt className="text-small text-muted-foreground">Where they&apos;re stuck</dt>
                    <dd className="whitespace-pre-wrap break-words">{d.stuckOn}</dd>
                  </div>
                ) : null}
              </dl>
              {d.answer ? (
                <div className="mt-4 rounded-md bg-primary-soft px-4 py-3">
                  <p className="text-small text-muted-foreground">
                    {d.announcementId ? "Answered for the class" : "Answer"}
                    {d.answeredByName ? ` · ${d.answeredByName}` : ""}
                    {d.answeredAt ? ` · ${formatRelative(d.answeredAt)}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{d.answer}</p>
                </div>
              ) : null}
              <div className="mt-4 grid gap-3">
                {d.announcementId ? null : <AnswerForm doubtId={d.id} current={d.answer} />}
                <div className="flex flex-wrap items-center gap-2">
                  {d.chatShared && d.conversationId && roles.get(d.courseId) === "teacher" ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/teacher/conversations/${d.conversationId}`}>
                        <MessagesSquare aria-hidden="true" />
                        Open shared chat
                      </Link>
                    </Button>
                  ) : null}
                  <form action={setDoubtStatus}>
                    <input type="hidden" name="doubtId" value={d.id} />
                    <input type="hidden" name="status" value={d.status === "resolved" ? "open" : "resolved"} />
                    <Button type="submit" variant="ghost" size="sm">
                      {d.status === "resolved" ? <RotateCcw aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}
                      {d.status === "resolved" ? "Reopen" : "Mark resolved"}
                    </Button>
                  </form>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
