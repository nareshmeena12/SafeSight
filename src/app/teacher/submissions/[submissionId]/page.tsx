import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { ModeBadge } from "@/components/product/mode-badge";
import { EvidenceSummary } from "@/components/trace/evidence-summary";
import { PrepareReportButton } from "@/components/trace/prepare-report-button";
import { TraceReplay } from "@/components/trace/replay";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getReplay } from "@/lib/trace/queries";
import { submissionIdSchema } from "@/lib/trace/schemas";
import { TRACE_TIME_ZONE } from "@/lib/trace/summary";

// The app shell's nav reads the pathname outside <Suspense>, which can't be
// prerendered for an unknown dynamic param; let this route render on request.
export const instant = false;

export const metadata: Metadata = { title: "Submission replay" };

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TRACE_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ReplayPage({ params }: PageProps<"/teacher/submissions/[submissionId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Replay params={params} />
    </Suspense>
  );
}

async function Replay({ params }: Pick<PageProps<"/teacher/submissions/[submissionId]">, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const id = submissionIdSchema.safeParse((await params).submissionId);
  if (!id.success) notFound();

  const replay = await getReplay(await createClient(), id.data);
  // Drafts stay private to the student until they submit.
  if (!replay || !replay.submission.submitted_at) notFound();
  const { submission } = replay;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/teacher/submissions"
            className="inline-flex min-h-11 items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            Submissions
          </Link>
        }
        title={submission.assignment?.title ?? "Submission"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {submission.student?.full_name || "Student"} ·{" "}
              {submission.assignment?.course?.code ? `${submission.assignment.course.code} · ` : ""}
              submitted{" "}
              <time dateTime={submission.submitted_at!}>
                {dateFormat.format(new Date(submission.submitted_at!))}
              </time>
            </span>
            {submission.assignment ? <ModeBadge mode={submission.assignment.ai_mode} /> : null}
          </span>
        }
        actions={
          submission.report && user.role === "teacher" ? (
            <PrepareReportButton submissionId={submission.id} label="Refresh summary" />
          ) : null
        }
      />

      <div className="grid gap-8">
        <EvidenceSummary
          report={submission.report}
          pending={
            user.role === "teacher" ? (
              <div className="grid gap-3">
                <p>The evidence summary isn&apos;t ready yet.</p>
                <PrepareReportButton submissionId={submission.id} label="Prepare summary" />
              </div>
            ) : (
              <p>The evidence summary isn&apos;t ready yet.</p>
            )
          }
        />

        <section aria-labelledby="replay-heading" className="grid gap-4">
          <div>
            <h2 id="replay-heading" className="text-title">
              Replay
            </h2>
            <p className="text-small text-muted-foreground">
              Drag the scrubber or press play to watch the text take shape. Pasted text is tinted amber.
            </p>
          </div>
          <TraceReplay
            events={replay.events}
            snapshots={replay.snapshots}
            finalContent={submission.content}
          />
        </section>
      </div>
    </>
  );
}
