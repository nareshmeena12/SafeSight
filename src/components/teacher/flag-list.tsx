import Link from "next/link";
import { Check, MessageSquareText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setFlagStatus } from "@/lib/teacher/actions";
import { formatDateTime } from "@/lib/teacher/dates";
import type { FlagItem } from "@/lib/teacher/queries";
import { flagTypeLabels, SeverityBadge } from "./flag-meta";

/** Flags with severity, reason and resolve / open-chat actions. */
export function FlagList({
  flags,
  showStudent = true,
  conversationFor,
}: {
  flags: FlagItem[];
  showStudent?: boolean;
  /** Conversation id per flag id, for the "Open chat" link. */
  conversationFor: Record<string, string | null>;
}) {
  return (
    <ul className="grid gap-3">
      {flags.map((f) => {
        const conversationId = conversationFor[f.id];
        return (
          <li
            key={f.id}
            className="flex flex-col gap-4 rounded-lg border bg-surface p-5 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge value={f.severity} />
                <h3 className="text-label">{flagTypeLabels[f.type]}</h3>
                {f.status === "resolved" ? (
                  <span className="text-small text-muted-foreground">· Resolved</span>
                ) : null}
              </div>
              <p className="mt-1 text-small text-muted-foreground">
                {showStudent ? (
                  <>
                    <Link href={`/teacher/students/${f.student.id}`} className="text-foreground hover:text-primary">
                      {f.student.name}
                    </Link>{" "}
                    ·{" "}
                  </>
                ) : null}
                {f.course.code || f.course.name} · {formatDateTime(f.createdAt)}
              </p>
              {f.reason ? <p className="mt-2 max-w-prose">{f.reason}</p> : null}
              {f.type === "wellbeing" ? (
                <p className="mt-2 max-w-prose text-small text-muted-foreground">
                  Private: the student does not see this flag. Sage shared the counselling contact with them. A short,
                  kind check-in usually helps most.
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {conversationId ? (
                <Button asChild variant="outline">
                  <Link href={`/teacher/conversations/${conversationId}`}>
                    <MessageSquareText aria-hidden="true" />
                    Open chat
                  </Link>
                </Button>
              ) : null}
              <form action={setFlagStatus}>
                <input type="hidden" name="flagId" value={f.id} />
                <input type="hidden" name="status" value={f.status === "open" ? "resolved" : "open"} />
                <Button type="submit" variant={f.status === "open" ? "default" : "ghost"}>
                  {f.status === "open" ? <Check aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                  {f.status === "open" ? "Resolve" : "Reopen"}
                </Button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
