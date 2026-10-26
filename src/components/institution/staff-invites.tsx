"use client";

import { useActionState, useRef } from "react";
import { Send } from "lucide-react";
import { Field } from "@/components/auth/field";
import { ErrorNote, SuccessNote } from "@/components/integrations/notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { inviteStaff, resendStaffInvite, revokeStaffInvite } from "@/lib/institution/actions";
import type { StaffInviteRow } from "@/lib/institution/server";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

const emailLabels: Record<StaffInviteRow["emailStatus"], string> = {
  queued: "Sending",
  sent: "Emailed",
  failed: "Email failed",
  not_configured: "Not emailed",
};

/** Invite teachers (or admins) by email; their role is applied when they sign in with it (S25). */
export function StaffInvites({ invites, emailReady }: { invites: StaffInviteRow[]; emailReady: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await inviteStaff(prev, data);
    if (result.status === "success") form.current?.reset();
    return result;
  }, initial);

  return (
    <div className="grid gap-6">
      <form ref={form} action={action} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="email" label="Email" type="email" inputMode="email" placeholder="name@college.edu.in" autoComplete="off" error={state.fieldErrors?.email} />
          <Field name="name" label="Name (optional)" placeholder="Dr. Ananya Rao" autoComplete="off" error={state.fieldErrors?.name} />
        </div>
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="invite-role">Role</Label>
          <select id="invite-role" name="role" defaultValue="teacher" className="h-11 w-full rounded-md border bg-background px-3 text-body">
            <option value="teacher">Teacher</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {state.status === "error" ? <ErrorNote message={state.message} /> : <SuccessNote message={state.message} />}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" disabled={pending}>
            <Send aria-hidden="true" />
            {pending ? "Inviting…" : "Invite"}
          </Button>
          <p className="text-small text-muted-foreground">
            {emailReady
              ? "They get an email. Their access starts when they sign up or sign in with this address."
              : "Email isn't set up, so tell them yourself. Their access starts when they sign up or sign in with this address."}
          </p>
        </div>
      </form>

      {invites.length ? (
        <ul className="divide-y rounded-md border" aria-label="Invites">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-mono text-small">{i.email}</p>
                <p className="text-small text-muted-foreground">
                  {i.name ? `${i.name} · ` : ""}
                  {i.role === "admin" ? "Admin" : "Teacher"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {i.status === "accepted" ? (
                  <Badge variant="good">Joined</Badge>
                ) : (
                  <>
                    <Badge variant="secondary">Waiting · {emailLabels[i.emailStatus]}</Badge>
                    {emailReady ? (
                      <form action={resendStaffInvite}>
                        <input type="hidden" name="inviteId" value={i.id} />
                        <Button type="submit" variant="ghost">
                          Email again
                        </Button>
                      </form>
                    ) : null}
                    <form action={revokeStaffInvite}>
                      <input type="hidden" name="inviteId" value={i.id} />
                      <Button type="submit" variant="ghost">
                        Cancel invite
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
