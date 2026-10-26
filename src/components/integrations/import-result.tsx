import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { ImportSummary } from "@/lib/setup/invites";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What an LMS import did, with the way to the course's invite list. */
export function ImportResult({ summary, courseId, created }: { summary: ImportSummary; courseId: string; created?: boolean }) {
  const notes = [...summary.skipped, ...summary.errors, ...summary.warnings];
  return (
    <div className="flex gap-3 rounded-md bg-primary-soft p-4" role="status">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
      <div className="grid min-w-0 gap-1 text-small">
        <p className="text-label">
          {created ? "Course created. " : ""}
          {[
            summary.invited ? `${plural(summary.invited, "student", "students")} invited` : null,
            summary.added ? `${plural(summary.added, "student", "students")} with an account added` : null,
          ]
            .filter(Boolean)
            .join(", ") || "No new students in that class"}
          .
        </p>
        {summary.invited ? (
          <p>
            {summary.emailing
              ? "Invite emails are on their way."
              : "Email isn't set up yet, so nothing was emailed. Students join when they sign in with the email their LMS has, or with the join code."}
          </p>
        ) : null}
        {summary.alreadyInvited || summary.alreadyInClass ? (
          <p className="text-muted-foreground">
            Skipped{" "}
            {[summary.alreadyInvited ? `${summary.alreadyInvited} already invited` : null, summary.alreadyInClass ? `${summary.alreadyInClass} already in the course` : null]
              .filter(Boolean)
              .join(" and ")}
            .
          </p>
        ) : null}
        {notes.slice(0, 8).map((n, i) => (
          <p key={i} className="text-muted-foreground">
            {n.message}
          </p>
        ))}
        {notes.length > 8 ? <p className="text-muted-foreground">…and {notes.length - 8} more notes.</p> : null}
        <p className="mt-1">
          <Link href={`/teacher/courses/${courseId}/students`} className="font-medium text-primary underline-offset-4 hover:underline">
            See the course&apos;s invite list
          </Link>
        </p>
      </div>
    </div>
  );
}
