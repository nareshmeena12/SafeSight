import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Info } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { ModeBadge } from "@/components/product/mode-badge";
import { EvidenceSummary } from "@/components/trace/evidence-summary";
import { TraceReplay } from "@/components/trace/replay";
import { TraceEditor } from "@/components/trace/trace-editor";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getOrStartDraft, getReplay } from "@/lib/trace/queries";
import { submissionIdSchema } from "@/lib/trace/schemas";
import { TRACE_TIME_ZONE } from "@/lib/trace/summary";

export const metadata: Metadata = { title: "Trace editor" };

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TRACE_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default function TracePage({ params }: PageProps<"/student/trace/[assignmentId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TraceWorkspace params={params} />
    </Suspense>
  );
}

async function TraceWorkspace({ params }: Pick<PageProps<"/student/trace/[assignmentId]">, "params">) {
  const user = await requireRole(["student"]);
  const id = submissionIdSchema.safeParse((await params).assignmentId);
  if (!id.success) notFound();

  const supabase = await createClient();
  const draft = await getOrStartDraft(supabase, user.id, id.data);
  if (!draft) notFound();
  const { assignment, submission } = draft;

  const header = (
    <PageHeader
      eyebrow={
        <Link href="/student/trace" className="inline-flex min-h-11 items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          Your writing
        </Link>
      }
      title={assignment.title}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span>
            {assignment.course?.code ? `${assignment.course.code} · ` : ""}
            {assignment.course?.name}
          </span>
          <ModeBadge mode={assignment.ai_mode} withHint />
        </span>
      }
    />
  );

  if (submission.submitted_at) {
    const replay = await getReplay(supabase, submission.id);
    const report = replay?.submission.report ?? null;
    return (
      <>
        {header}
        <div className="grid gap-8">
          <p className="text-muted-foreground">
            Submitted{" "}
            <time dateTime={submission.submitted_at}>
              {dateFormat.format(new Date(submission.submitted_at))}
            </time>
            . This is what your teacher sees.
          </p>
          <EvidenceSummary
            report={report}
            pending="Trace is preparing a short summary of how this was written. Check back in a minute."
          />
          {replay ? (
            <section aria-labelledby="replay-heading" className="grid gap-4">
              <h2 id="replay-heading" className="text-title">
                Replay
              </h2>
              <TraceReplay
                events={replay.events}
                snapshots={replay.snapshots}
                finalContent={replay.submission.content}
              />
            </section>
          ) : null}
          <div>
            <Button variant="outline" asChild>
              <Link href="/student/trace">Back to your writing</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid gap-4">
        {assignment.instructions ? (
          <details className="rounded-lg border bg-surface p-4 sm:px-6" open>
            <summary className="min-h-11 cursor-pointer content-center text-label">Instructions</summary>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">{assignment.instructions}</p>
          </details>
        ) : null}
        <p className="flex items-start gap-2 rounded-lg bg-primary-soft p-4 text-small text-foreground sm:px-6">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
          <span>
            Trace records how this is written: typing, pastes, edits and time spent. When you submit,
            your teacher sees the text, a replay and a short neutral summary. You can see all of it
            too.
          </span>
        </p>
        <TraceEditor submissionId={submission.id} initialContent={submission.content} />
      </div>
    </>
  );
}
