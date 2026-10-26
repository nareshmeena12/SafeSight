import { ClipboardCheck } from "lucide-react";
import { totalPoints, type Feedback } from "@/lib/feedback/rubric";
import { formatDateTime } from "@/lib/teacher/dates";

/** Approved feedback, as the student sees it on their submitted work. */
export function StudentFeedback({ feedback }: { feedback: Feedback }) {
  const total = totalPoints(feedback.criteria);
  return (
    <section aria-labelledby="student-feedback-heading" className="grid gap-4 rounded-lg border bg-surface p-4 sm:p-6">
      <div className="flex items-start gap-2">
        <ClipboardCheck className="mt-1 size-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
        <div>
          <h2 id="student-feedback-heading" className="text-title">
            Feedback from your teacher
          </h2>
          {feedback.approvedAt ? <p className="text-small text-muted-foreground">Shared {formatDateTime(feedback.approvedAt)}</p> : null}
        </div>
      </div>
      {feedback.overall ? <p className="whitespace-pre-line">{feedback.overall}</p> : null}
      <ul className="grid gap-3">
        {feedback.criteria
          .filter((c) => c.comment || c.points !== null)
          .map((c, i) => (
            <li key={i} className="grid gap-1 rounded-md border p-4">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-label">{c.criterion}</span>
                {c.maxPoints !== null && c.points !== null ? (
                  <span className="font-mono text-mono">
                    {c.points} / {c.maxPoints}
                  </span>
                ) : null}
              </p>
              {c.comment ? <p className="whitespace-pre-line text-small text-muted-foreground">{c.comment}</p> : null}
            </li>
          ))}
      </ul>
      {total ? (
        <p className="text-small">
          Total <span className="font-mono text-mono">{total.points} / {total.max}</span>
        </p>
      ) : null}
    </section>
  );
}
