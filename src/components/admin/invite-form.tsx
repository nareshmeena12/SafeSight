"use client";

import { useActionState, useState } from "react";
import { CircleCheck } from "lucide-react";
import { FormMessage } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { sendTeacherInvites, type InviteState } from "@/lib/admin/actions";

const initial: InviteState = { status: "idle" };
const NONE = "none";

/** Invite teachers by email, optionally straight into a department. */
export function InviteForm({
  departments,
  emailReady,
  defaultDepartmentId,
}: {
  departments: { id: string; name: string }[];
  emailReady: boolean;
  defaultDepartmentId?: string;
}) {
  const [state, action, pending] = useActionState(sendTeacherInvites, initial);
  const [department, setDepartment] = useState(defaultDepartmentId ?? NONE);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} noValidate className="grid gap-5">
      <FormMessage message={state.status === "error" ? state.message : undefined} />
      <div className="grid gap-2">
        <Label htmlFor="invite-emails">Teachers&apos; emails</Label>
        <Textarea
          id="invite-emails"
          name="emails"
          rows={4}
          placeholder={"kavita.sharma@college.edu\nArjun Mehta <arjun.mehta@college.edu>"}
          aria-describedby={errors?.emails ? "invite-emails-error" : "invite-emails-hint"}
          aria-invalid={errors?.emails ? true : undefined}
        />
        {errors?.emails ? (
          <p id="invite-emails-error" className="text-sm text-destructive">
            {errors.emails}
          </p>
        ) : (
          <p id="invite-emails-hint" className="text-sm text-muted-foreground">
            One per line, up to 50. A name before the email is optional.
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:max-w-sm">
        <Label htmlFor="invite-department">Department</Label>
        <input type="hidden" name="departmentId" value={department === NONE ? "" : department} />
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger id="invite-department" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No department yet</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : emailReady ? "Send invites" : "Add invites"}
        </Button>
        {!emailReady ? (
          <p className="text-small text-muted-foreground">
            Email isn&apos;t set up yet, so copy each invite from the list below.
          </p>
        ) : null}
      </div>
      {state.status === "success" ? <InviteResult summary={state.summary} /> : null}
    </form>
  );
}

function InviteResult({ summary }: { summary: Extract<InviteState, { status: "success" }>["summary"] }) {
  const lines = [
    summary.added ? `${summary.added} already had an account and ${summary.added === 1 ? "is" : "are"} now set up as ${summary.added === 1 ? "a teacher" : "teachers"} here.` : null,
    summary.invited ? `${summary.invited} ${summary.invited === 1 ? "invite" : "invites"} added. They join when they sign up with that email.` : null,
    summary.alreadyInvited ? `${summary.alreadyInvited} ${summary.alreadyInvited === 1 ? "was" : "were"} already invited.` : null,
    summary.emailing ? "Emails are on their way." : null,
  ].filter(Boolean);
  return (
    <div className="grid gap-2 rounded-md border bg-surface p-4 text-small" role="status">
      {lines.map((line) => (
        <p key={line} className="flex items-start gap-2">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={1.5} aria-hidden="true" />
          {line}
        </p>
      ))}
      {summary.skipped.length ? (
        <div>
          <p className="text-label">Not invited</p>
          <ul className="mt-1 grid gap-1 text-muted-foreground">
            {summary.skipped.map((s) => (
              <li key={s.email} className="break-all">
                {s.email} {s.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {summary.invalid.length ? (
        <p className="text-muted-foreground">
          We couldn&apos;t read an email in: <span className="break-all">{summary.invalid.join("; ")}</span>
        </p>
      ) : null}
    </div>
  );
}
