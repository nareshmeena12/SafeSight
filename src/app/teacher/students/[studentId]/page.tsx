import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Mail, MessagesSquare } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { MasteryBadge } from "@/components/learning/mastery";
import { ModeBadge } from "@/components/product/mode-badge";
import { StatCard } from "@/components/product/stat-card";
import { RelianceLineChart } from "@/components/teacher/charts";
import { FlagList } from "@/components/teacher/flag-list";
import { TopicList } from "@/components/teacher/topic-list";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { studentMasterySummary } from "@/lib/learning/queries";
import { relianceBand } from "@/lib/reliance";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatRelative, formatShortDate } from "@/lib/teacher/dates";
import { conversationsForFlags, getStudentDetail } from "@/lib/teacher/queries";

export const metadata: Metadata = { title: "Student", robots: { index: false } };

export default function StudentPage({ params }: PageProps<"/teacher/students/[studentId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentContent params={params} />
    </Suspense>
  );
}

function Panel({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border bg-surface p-6">
      <h2 id={id} className="text-title">
        {title}
      </h2>
      {note ? <p className="text-small text-muted-foreground">{note}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed px-4 py-6 text-center text-small text-muted-foreground">{children}</p>
  );
}

async function StudentContent({ params }: Pick<PageProps<"/teacher/students/[studentId]">, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const { studentId } = await params;
  if (!z.uuid().safeParse(studentId).success) notFound();
  const db = await createClient();
  const detail = await getStudentDetail(db, user.id, studentId);
  if (!detail) notFound();
  const { student, trend, topics, flags, submissions, sharedConversations } = detail;
  const [conversationFor, mastery] = await Promise.all([conversationsForFlags(db, flags), studentMasterySummary(db, studentId)]);
  const openFlags = flags.filter((f) => f.status === "open");
  const firstName = student.name.split(" ")[0];
  const lensHref = (q: string) => `/teacher/lens?${new URLSearchParams({ q }).toString()}`;

  return (
    <>
      <Link
        href="/teacher/students"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        All students
      </Link>
      <PageHeader
        eyebrow={student.courses.map((c) => c.code || c.name).join(" · ")}
        title={student.name}
        description="Summaries and scores. Full chats open only for flagged or shared conversations."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={lensHref(`How is ${student.name} doing, and what should I do next?`)}>
                <MessagesSquare aria-hidden="true" />
                Ask Lens
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={lensHref(
                  `Draft a short, encouraging email to ${student.name} based on how they're doing. Suggest one next step.`,
                )}
              >
                <Mail aria-hidden="true" />
                Draft email
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:gap-8">
        <section aria-label="Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Reliance Score"
            value={student.reliance === null ? "—" : Math.round(student.reliance)}
            note={
              student.reliance === null ? (
                "No weekly score yet"
              ) : (
                `${{ low: "Low", medium: "Medium", high: "High" }[relianceBand(student.reliance)]} band${
                  student.relianceWeek ? ` · week of ${formatShortDate(student.relianceWeek)}` : ""
                }`
              )
            }
          />
          <StatCard label="Conversations" value={student.conversations} note="last 30 days" />
          <StatCard
            label="Answer-seeking"
            value={student.messages > 0 ? `${Math.round((student.answerSeeking / student.messages) * 100)}%` : "—"}
            note={`of ${student.messages} messages`}
          />
          <StatCard
            label="Open flags"
            value={openFlags.length}
            highlight={openFlags.length > 0}
            note={`Last active: ${formatRelative(student.lastActiveAt)}`}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <Panel id="score-trend" title="Score trend" note="Weekly Reliance Score, last 8 weeks.">
            {trend.some((p) => p.avgReliance !== null) ? (
              <RelianceLineChart
                title={`${student.name}'s Reliance Score by week`}
                data={trend.map((p) => ({ label: formatShortDate(p.week), value: p.avgReliance }))}
              />
            ) : (
              <Quiet>The trend appears once {firstName} has used Sage for a week.</Quiet>
            )}
          </Panel>
          <Panel id="topics" title="Topics asked about" note="From their Sage questions.">
            {topics.length > 0 ? <TopicList topics={topics} /> : <Quiet>No topics yet.</Quiet>}
          </Panel>
        </div>

        <Panel
          id="mastery"
          title="Mastery by topic"
          note={`From ${firstName}'s own practice, quick checks and explain-backs. A summary only — their answers stay private.`}
        >
          {mastery.length > 0 ? (
            <ul className="grid gap-x-8 sm:grid-cols-2">
              {mastery.map((m) => (
                <li key={`${m.courseId}-${m.topic}`} className="flex items-center justify-between gap-3 border-b py-3">
                  <span className="min-w-0">
                    {m.topic}
                    <span className="block text-small text-muted-foreground">
                      <span className="font-mono">{m.evidence}</span> {m.evidence === 1 ? "check" : "checks"} · {formatShortDate(m.updatedAt)}
                    </span>
                  </span>
                  <MasteryBadge mastery={m.mastery} />
                </li>
              ))}
            </ul>
          ) : (
            <Quiet>No practice yet. Mastery appears once {firstName} practises a topic with Sage.</Quiet>
          )}
        </Panel>

        <Panel id="flags" title="Flags">
          {flags.length > 0 ? (
            <FlagList flags={flags} showStudent={false} conversationFor={conversationFor} />
          ) : (
            <Quiet>No flags for {firstName}.</Quiet>
          )}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <Panel id="submissions" title="Written work" note="Evidence summaries from Trace.">
            {submissions.length > 0 ? (
              <ul className="grid gap-4">
                {submissions.map((s) => (
                  <li key={s.id} className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-label">{s.assignmentTitle}</span>
                      <ModeBadge mode={s.aiMode} />
                    </div>
                    <p className="text-small text-muted-foreground">
                      {s.submittedAt ? `Submitted ${formatDateTime(s.submittedAt)}` : "Still writing"}
                    </p>
                    {s.report ? (
                      <p className="text-small">
                        {s.report.summary}{" "}
                        <span className="text-muted-foreground">
                          (<span className="font-mono">{Math.round(s.report.pasteRatio * 100)}%</span> pasted ·{" "}
                          <span className="font-mono">{Math.round(s.report.activeMinutes)}</span> min active ·{" "}
                          <span className="font-mono">{s.report.sessions}</span>{" "}
                          {s.report.sessions === 1 ? "session" : "sessions"})
                        </span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet>No written work yet.</Quiet>
            )}
          </Panel>
          <Panel id="shared" title="Shared chats" note={`Chats ${firstName} chose to share with you.`}>
            {sharedConversations.length > 0 ? (
              <ul className="-mx-2 grid">
                {sharedConversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/teacher/conversations/${c.id}`}
                      className="flex min-h-11 items-center justify-between gap-4 rounded-sm px-2 transition-colors duration-150 ease-out hover:bg-hover"
                    >
                      <span>{c.assignmentTitle ?? "Sage chat"}</span>
                      <span className="text-small text-muted-foreground">{formatShortDate(c.startedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet>Nothing shared yet.</Quiet>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
