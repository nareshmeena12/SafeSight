import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { FeedbackDrafts } from "@/components/feedback/feedback-drafts";
import { VivaQuestions } from "@/components/lens/viva-questions";
import { CheckBadge } from "@/components/numbers/check-badge";
import { ModeBadge } from "@/components/product/mode-badge";
import { EvidenceSummary } from "@/components/trace/evidence-summary";
import { PrepareReportButton } from "@/components/trace/prepare-report-button";
import { TraceReplay } from "@/components/trace/replay";
import { aiStatus } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/dal";
import { readFeedback, rubricForSubmission } from "@/lib/feedback/feedback";
import { DEFAULT_RUBRIC } from "@/lib/feedback/rubric";
import { readVivaQuestions } from "@/lib/lens/viva";
import { vivaEvidence } from "@/lib/lens/viva-schema";
import { checkStudentAnswer, getStudentNumbers } from "@/lib/numbers/data";
import { expectedAnswer, formatNumber } from "@/lib/numbers/numbers";
import { createClient } from "@/lib/supabase/server";
import { measureHtml } from "@/lib/trace/html";
import { getReplay } from "@/lib/trace/queries";
import { submissionIdSchema } from "@/lib/trace/schemas";
import { TRACE_TIME_ZONE } from "@/lib/trace/summary";

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

  const db = await createClient();
  const replay = await getReplay(db, id.data);
  // Drafts stay private to the student until they submit.
  if (!replay || !replay.submission.submitted_at) notFound();
  const { submission } = replay;

  // S18: viva questions and, for per-student numbers, the auto-check. The replay
  // being visible (RLS) proves this is the teacher's course.
  // S19: feedback drafts follow the assignment's rubric.
  const [viva, numbers, feedback, rubric] = await Promise.all([
    readVivaQuestions(db, submission.id),
    submission.assignment ? getStudentNumbers(db, submission.student_id, submission.assignment.id) : null,
    readFeedback(db, submission.id),
    rubricForSubmission(db, submission.id),
  ]);
  const evidence = vivaEvidence({
    pasteRatio: submission.report?.paste_ratio ?? null,
    activeMinutes: submission.report?.active_minutes ?? null,
    finalChars: measureHtml(submission.content).chars,
    pasteSizes: replay.events.filter((e) => e.type === "paste").map((e) => e.size),
  });
  const expected = numbers ? expectedAnswer(numbers.set, numbers.values) : null;

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

        {numbers ? (
          <section aria-labelledby="numbers-heading" className="grid gap-3 rounded-lg border bg-surface p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="numbers-heading" className="text-title">
                Their numbers
              </h2>
              <CheckBadge result={checkStudentAnswer(numbers)} />
            </div>
            <dl className="grid gap-x-6 gap-y-2 font-mono text-mono sm:grid-cols-2 lg:grid-cols-3">
              {numbers.set.variables.map((v) => (
                <div key={v.name}>
                  <dt className="font-sans text-small text-muted-foreground">{v.label || v.name}</dt>
                  <dd>
                    {v.name} = {numbers.values[v.name].toFixed(v.decimals)}
                    {v.unit ? ` ${v.unit}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-small">
              {numbers.set.answerLabel || "Answer"}: expected{" "}
              <span className="font-mono text-mono">
                {expected === null ? "—" : formatNumber(expected)}
                {numbers.set.answerUnit ? ` ${numbers.set.answerUnit}` : ""}
              </span>
              , given <span className="font-mono text-mono">{numbers.answer?.text ?? "none"}</span> (within{" "}
              {numbers.set.tolerancePct}%).
            </p>
          </section>
        ) : null}

        <FeedbackDrafts
          submissionId={submission.id}
          studentName={submission.student?.full_name || "the student"}
          initial={feedback}
          rubric={rubric ?? DEFAULT_RUBRIC}
          generalCriteria={!rubric}
          configured={aiStatus().chat}
          canEdit={user.role === "teacher"}
        />

        <VivaQuestions
          submissionId={submission.id}
          title={submission.assignment?.title ?? "Submission"}
          initial={viva}
          evidence={evidence}
          configured={aiStatus().chat}
          canEdit={user.role === "teacher"}
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
