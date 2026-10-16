import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, MonitorCheck, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { dayTime, spacedCode, timeOnly } from "@/components/lab/format";
import { NewSessionDialog } from "@/components/lab/new-session-dialog";
import { EmptyState } from "@/components/product/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { listLabSessions, type LabSession } from "@/lib/lab/queries";
import { currentSessionState, type SessionState } from "@/lib/lab/status";
import { createClient } from "@/lib/supabase/server";
import { courseScope } from "@/lib/teacher/queries";

export const metadata: Metadata = { title: "Lab sessions" };

export default function LabPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LabContent />
    </Suspense>
  );
}

async function LabContent() {
  const user = await requireRole(["teacher", "admin"]);
  const db = await createClient();
  const [courses, sessions] = await Promise.all([courseScope(db, user.id), listLabSessions(db, user.id)]);
  const groups: Record<SessionState, LabSession[]> = { live: [], upcoming: [], ended: [] };
  for (const s of sessions) groups[currentSessionState(toTimes(s))].push(s);
  groups.upcoming.reverse(); // soonest first

  const newButton = (
    <NewSessionDialog
      courses={courses ?? []}
      trigger={
        <Button disabled={!courses?.length}>
          <Plus aria-hidden="true" />
          New lab session
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        eyebrow="Live Lab Mode"
        title="Lab sessions"
        description="Run a lab exam on college PCs. AI sites are blocked, and you see each seat live: green is recording, amber needs a look, red has gone quiet."
        actions={newButton}
      />

      {sessions.length === 0 ? (
        <EmptyState
          icon={MonitorCheck}
          title="No lab sessions yet"
          description={
            courses?.length
              ? "Create a session for your next lab exam. You'll get a 6-digit code to put on the board."
              : "Create a course first, then come back to run a lab session for it."
          }
          action={courses?.length ? newButton : undefined}
        />
      ) : (
        <div className="grid gap-10">
          <SessionGroup title="Live now" sessions={groups.live} state="live" />
          <SessionGroup title="Coming up" sessions={groups.upcoming} state="upcoming" />
          <SessionGroup title="Past sessions" sessions={groups.ended} state="ended" />
        </div>
      )}

      <section aria-labelledby="lab-setup" className="mt-12 grid gap-4 rounded-lg border bg-surface p-6 lg:grid-cols-2">
        <div>
          <h2 id="lab-setup" className="text-title">
            Before your first lab
          </h2>
          <p className="mt-2 text-small text-muted-foreground">
            The lab admin installs the SafeSight Lab extension in Chrome on each PC once, and sets this site&apos;s
            address and the PC&apos;s seat number in its options. Get written permission from the lab administrator
            before installing it.
          </p>
        </div>
        <div>
          <h2 className="text-title">What it can&apos;t see</h2>
          <p className="mt-2 text-small text-muted-foreground">
            It covers Chrome only, so set Chrome as the lab&apos;s only browser. It can&apos;t see phones, so an
            invigilator is still needed. It records counts and site names, never what students type or paste.
          </p>
        </div>
      </section>
    </>
  );
}

function toTimes(s: LabSession) {
  return { starts_at: s.startsAt, ends_at: s.endsAt, ended_at: s.endedAt };
}

function SessionGroup({ title, sessions, state }: { title: string; sessions: LabSession[]; state: SessionState }) {
  if (sessions.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-4 text-eyebrow text-muted-foreground uppercase">{title}</h2>
      <ul className="grid gap-3">
        {sessions.map((s) => {
          const end = s.endedAt && s.endedAt < s.endsAt ? s.endedAt : s.endsAt;
          return (
            <li key={s.id}>
              <Link
                href={state === "ended" ? `/teacher/lab/${s.id}/report` : `/teacher/lab/${s.id}`}
                className="flex min-h-11 flex-col gap-3 rounded-lg border bg-surface p-4 transition-colors duration-150 ease-out hover:border-border-strong sm:flex-row sm:items-center sm:justify-between sm:p-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-title">{s.title}</p>
                    {state === "live" ? <Badge variant="good">Live</Badge> : null}
                  </div>
                  <p className="mt-1 text-small text-muted-foreground">
                    {[s.course, s.room].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-small text-muted-foreground">
                    {dayTime.format(new Date(s.startsAt))} – {timeOnly.format(new Date(end))}
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  {state !== "ended" ? (
                    <div className="text-right">
                      <p className="text-label text-muted-foreground">Code</p>
                      <p className="font-mono text-mono">{spacedCode(s.code)}</p>
                    </div>
                  ) : null}
                  <div className="text-right">
                    <p className="text-label text-muted-foreground">Seats</p>
                    <p className="font-mono text-mono">{s.seats}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
