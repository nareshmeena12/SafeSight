import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { dayTime, spacedCode, timeOnly } from "@/components/lab/format";
import { LiveLab } from "@/components/lab/live-lab";
import { BlocklistDialog, SessionActions } from "@/components/lab/session-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { getLabSession, listEvents, listSeats } from "@/lib/lab/queries";
import { labSessionIdSchema } from "@/lib/lab/schemas";
import { currentSessionState, effectiveEnd } from "@/lib/lab/status";
import { createClient } from "@/lib/supabase/server";

// The app shell's nav reads the pathname outside <Suspense>, which can't be
// prerendered for an unknown dynamic param; let this route render on request.
export const instant = false;

export const metadata: Metadata = { title: "Lab session" };

export default function LabSessionPage({ params }: PageProps<"/teacher/lab/[sessionId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LabSessionContent params={params} />
    </Suspense>
  );
}

async function LabSessionContent({ params }: Pick<PageProps<"/teacher/lab/[sessionId]">, "params">) {
  await requireRole(["teacher", "admin"]);
  const parsed = labSessionIdSchema.safeParse({ sessionId: (await params).sessionId });
  if (!parsed.success) notFound();
  const db = await createClient();
  const session = await getLabSession(db, parsed.data.sessionId);
  if (!session) notFound();
  const [seats, events] = await Promise.all([listSeats(db, session.id), listEvents(db, session.id)]);

  const times = { starts_at: session.startsAt, ends_at: session.endsAt, ended_at: session.endedAt };
  const state = currentSessionState(times);
  const end = new Date(effectiveEnd(times));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/teacher/lab" className="inline-flex min-h-11 items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            Lab sessions
          </Link>
        }
        title={session.title}
        description={
          <>
            {[session.course, session.room].filter(Boolean).join(" · ")}
            <br />
            {dayTime.format(new Date(session.startsAt))} – {timeOnly.format(end)}
          </>
        }
        actions={
          state === "ended" ? (
            <Button asChild>
              <Link href={`/teacher/lab/${session.id}/report`}>
                <FileText aria-hidden="true" />
                Open report
              </Link>
            </Button>
          ) : (
            <>
              <BlocklistDialog sessionId={session.id} blocklist={session.blocklist} />
              <SessionActions sessionId={session.id} live={state === "live"} />
            </>
          )
        }
      />

      {state !== "ended" ? (
        <section
          aria-label="Session code"
          className="mb-10 flex flex-col gap-4 rounded-lg border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-label text-muted-foreground">Session code</p>
            <p className="font-mono text-[44px] leading-tight tracking-[0.08em] text-foreground sm:text-[56px]">
              <span className="border-b-4 border-insight">{spacedCode(session.code)}</span>
            </p>
          </div>
          <div className="max-w-md text-small text-muted-foreground">
            <div className="mb-2">
              {state === "live" ? <Badge variant="good">Live until {timeOnly.format(end)}</Badge> : <Badge variant="secondary">Starts {timeOnly.format(new Date(session.startsAt))}</Badge>}
            </div>
            Students open the SafeSight Lab extension in Chrome and enter their roll number and this code. Joining
            opens 15 minutes before the start. Recording stops by itself at the end.
          </div>
        </section>
      ) : null}

      <LiveLab
        sessionId={session.id}
        endsAt={end.toISOString()}
        ended={state === "ended"}
        initialSeats={seats}
        initialEvents={events}
      />
    </>
  );
}
