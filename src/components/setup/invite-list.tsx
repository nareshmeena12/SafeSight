import { Mail, RotateCcw, Trash2, UserRoundCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { removeInvite, resendInvite } from "@/lib/setup/actions";
import type { InviteRow } from "@/lib/setup/invites";

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

const emailBadge = {
  queued: { variant: "warning", label: "Sending" },
  sent: { variant: "good", label: "Emailed" },
  failed: { variant: "critical", label: "Email didn't send" },
  not_configured: { variant: "secondary", label: "Not emailed" },
} as const;

/** Invited students: joined or waiting, and whether their email went out. */
export function InviteList({ courseId, invites, emailReady }: { courseId: string; invites: InviteRow[]; emailReady: boolean }) {
  const waiting = invites.filter((i) => i.status === "pending");
  const joined = invites.filter((i) => i.status === "joined");
  return (
    <section aria-labelledby="invites-title" className="rounded-lg border bg-surface p-6">
      <h2 id="invites-title" className="text-title">
        Invited students
      </h2>
      <p className="mb-4 text-small text-muted-foreground">
        {waiting.length} waiting to join · {joined.length} joined from your list
      </p>
      {invites.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center">
          <Mail className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-small text-muted-foreground">Import a class list and invited students appear here.</p>
        </div>
      ) : (
        <ul className="-mx-2 grid">
          {[...waiting, ...joined].map((i) => {
            const badge = emailBadge[i.emailStatus];
            return (
              <li key={i.id} className="flex flex-col gap-2 rounded-sm px-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label">{i.name || i.email}</p>
                  <p className="truncate text-small text-muted-foreground">
                    <span className="font-mono">{i.email}</span>
                    {i.rollNumber ? <span className="font-mono"> · {i.rollNumber}</span> : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {i.status === "joined" ? (
                    <Badge variant="good">
                      <UserRoundCheck aria-hidden="true" />
                      Joined {i.joinedAt ? dateFormat.format(new Date(i.joinedAt)) : ""}
                    </Badge>
                  ) : (
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  )}
                  {i.status === "pending" && emailReady && i.emailStatus !== "queued" ? (
                    <form action={resendInvite}>
                      <input type="hidden" name="courseId" value={courseId} />
                      <input type="hidden" name="inviteId" value={i.id} />
                      <Button type="submit" variant="ghost" size="icon" aria-label={`Email ${i.email} again`} title="Email again">
                        <RotateCcw aria-hidden="true" />
                      </Button>
                    </form>
                  ) : null}
                  {i.status === "pending" ? (
                    <form action={removeInvite}>
                      <input type="hidden" name="courseId" value={courseId} />
                      <input type="hidden" name="inviteId" value={i.id} />
                      <Button type="submit" variant="ghost" size="icon" aria-label={`Remove the invite for ${i.email}`} title="Remove invite">
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
