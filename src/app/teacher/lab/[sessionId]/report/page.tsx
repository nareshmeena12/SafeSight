import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Download, FileText, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { dayTime, timeOnly } from "@/components/lab/format";
import { EmptyState } from "@/components/product/empty-state";
import { StatCard } from "@/components/product/stat-card";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { prepareLabReports } from "@/lib/lab/actions";
import { seatName } from "@/lib/lab/describe";
import { loadLabReport } from "@/lib/lab/report-data";
import { labSessionIdSchema } from "@/lib/lab/schemas";
import { effectiveEnd } from "@/lib/lab/status";
import { createClient } from "@/lib/supabase/server";

// See [sessionId]/page.tsx: render on request.
export const instant = false;

export const metadata: Metadata = { title: "Lab session report" };

export default function LabReportPage({ params }: PageProps<"/teacher/lab/[sessionId]/report">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LabReportContent params={params} />
    </Suspense>
  );
}

async function LabReportContent({ params }: Pick<PageProps<"/teacher/lab/[sessionId]/report">, "params">) {
  await requireRole(["teacher", "admin"]);
  const parsed = labSessionIdSchema.safeParse({ sessionId: (await params).sessionId });
  if (!parsed.success) notFound();
  const data = await loadLabReport(await createClient(), parsed.data.sessionId);
  if (!data) notFound();
  const { session, ended, rows } = data;
  const end = new Date(effectiveEnd({ starts_at: session.startsAt, ends_at: session.endsAt, ended_at: session.endedAt }));

  const withBlocked = rows.filter((r) => (r.metrics?.blockedAttempts ?? 0) > 0).length;
  const withSilence = rows.filter((r) => (r.metrics?.silentPeriods ?? 0) > 0).length;
  const finishedEarly = rows.filter((r) => r.metrics?.finishedEarly).length;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/teacher/lab/${session.id}`} className="inline-flex min-h-11 items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            Seat grid
          </Link>
        }
        title={`Report: ${session.title}`}
        description={
          <>
            {[session.course, session.room].filter(Boolean).join(" · ")}
            <br />
            {dayTime.format(new Date(session.startsAt))} – {timeOnly.format(end)}. Each summary states what the extension
            recorded. It is evidence, not a verdict: you decide what it means.
          </>
        }
        actions={
          ended && rows.length ? (
            <>
              <form action={prepareLabReports}>
                <input type="hidden" name="sessionId" value={session.id} />
                <Button type="submit" variant="outline">
                  <RefreshCw aria-hidden="true" />
                  Refresh summaries
                </Button>
              </form>
              <Button asChild>
                <a href={`/api/lab/sessions/${session.id}/csv`} download>
                  <Download aria-hidden="true" />
                  Download CSV
                </a>
              </Button>
            </>
          ) : null
        }
      />

      {!ended ? (
        <EmptyState
          icon={FileText}
          title="The report is ready when the session ends"
          description={`This session runs until ${timeOnly.format(end)}. Summaries are written for every seat once it's over.`}
          action={
            <Button asChild variant="outline">
              <Link href={`/teacher/lab/${session.id}`}>Back to the seat grid</Link>
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="Nobody joined this session" description="There is nothing to report." />
      ) : (
        <>
          <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Seats" value={rows.length} />
            <StatCard label="Tried a blocked site" value={withBlocked} highlight={withBlocked > 0} />
            <StatCard label="Had no signal" value={withSilence} />
            <StatCard label="Finished early" value={finishedEarly} />
          </div>
          <ul className="grid gap-3">
            {rows.map(({ seat, summary, metrics }) => (
              <li key={seat.id} className="rounded-lg border bg-surface p-4 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-title">
                    {seatName(seat.seatLabel)}
                    <span className="ml-2 text-body text-muted-foreground">
                      {seat.studentName ? `${seat.studentName} · ${seat.rollNumber}` : seat.rollNumber}
                    </span>
                  </h2>
                  {metrics ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      {metrics.blockedAttempts} blocked · {metrics.tabSwitches} tabs · {metrics.pastes} pastes
                    </p>
                  ) : null}
                </div>
                <p className="mt-2 max-w-3xl">{summary ?? "The summary is being prepared. Refresh in a moment."}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
