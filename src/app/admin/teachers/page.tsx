import type { Metadata } from "next";
import { Suspense } from "react";
import { Mail, Trash2, Users } from "lucide-react";
import { CopyText } from "@/components/admin/copy-text";
import { DepartmentSelect } from "@/components/admin/department-select";
import { InviteForm } from "@/components/admin/invite-form";
import { NoInstitution } from "@/components/admin/no-institution";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { emailTeacherInviteAgain, removeTeacherInvite } from "@/lib/admin/actions";
import { shareableInvite } from "@/lib/admin/invites";
import { adminContext, listDepartments, listStaff, listTeacherInvites } from "@/lib/admin/queries";
import { emailConfigured } from "@/lib/email/send";
import { formatRelative, formatShortDate } from "@/lib/teacher/dates";

export const metadata: Metadata = { title: "Teachers" };

const emailLabel = {
  queued: "Sending…",
  sent: "Emailed",
  failed: "Email failed",
  not_configured: "Not emailed",
} as const;

export default function TeachersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Teachers />
    </Suspense>
  );
}

async function Teachers() {
  const { user, db, institution } = await adminContext();
  if (!institution) return <NoInstitution />;
  const [staff, departments, invites] = await Promise.all([
    listStaff(db),
    listDepartments(db, institution.id),
    listTeacherInvites(db, institution.id),
  ]);
  const options = departments.map((d) => ({ id: d.id, name: d.name }));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const pending = invites.filter((i) => i.status === "pending");
  const emailReady = emailConfigured();

  return (
    <>
      <PageHeader
        eyebrow="Teachers"
        title="Teachers"
        description="Invite teachers and put them in departments. A teacher's new courses follow their department's AI policy."
      />

      <section aria-labelledby="invite-title" className="rounded-lg border bg-surface p-6">
        <h2 id="invite-title" className="text-title">
          Invite teachers
        </h2>
        <p className="mb-6 text-small text-muted-foreground">
          Someone who already has a SafeSight account with that email is set up as a teacher here straight away. Everyone else
          joins when they sign up with it.
        </p>
        <InviteForm departments={options} emailReady={emailReady} />
      </section>

      {pending.length > 0 ? (
        <section aria-labelledby="pending-title" className="mt-8">
          <h2 id="pending-title" className="mb-1 text-title">
            Waiting to sign up
          </h2>
          <p className="mb-4 text-small text-muted-foreground">
            {emailReady ? "Email an invite again or copy it to send yourself." : "Copy each invite and send it from your own email or chat."}
          </p>
          <ul className="divide-y rounded-lg border bg-surface">
            {pending.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="truncate text-label">{i.fullName || i.email}</p>
                  <p className="truncate text-small text-muted-foreground">
                    {i.fullName ? `${i.email} · ` : ""}
                    {i.departmentId ? deptName.get(i.departmentId) : "No department"} · invited {formatShortDate(i.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={i.emailStatus === "failed" ? "destructive" : "secondary"}>{emailLabel[i.emailStatus]}</Badge>
                  <CopyText
                    text={shareableInvite(institution, i, i.departmentId ? (deptName.get(i.departmentId) ?? "") : "", user.fullName)}
                    label={`Copy the invite for ${i.email}`}
                  />
                  {emailReady ? (
                    <form action={emailTeacherInviteAgain}>
                      <input type="hidden" name="inviteId" value={i.id} />
                      <Button type="submit" variant="ghost" size="icon" aria-label={`Email ${i.email} again`} title="Email again">
                        <Mail aria-hidden="true" />
                      </Button>
                    </form>
                  ) : null}
                  <form action={removeTeacherInvite}>
                    <input type="hidden" name="inviteId" value={i.id} />
                    <Button type="submit" variant="ghost" size="icon" aria-label={`Remove the invite for ${i.email}`} title="Remove invite">
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="staff-title" className="mt-8">
        <h2 id="staff-title" className="mb-4 text-title">
          Your teachers
        </h2>
        {staff.length === 0 ? (
          <EmptyState icon={Users} title="No teachers yet" description="Invite your first teachers above." />
        ) : (
          <ul className="divide-y rounded-lg border bg-surface">
            {staff.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-label">
                    <span className="truncate">{t.fullName || t.email}</span>
                    {t.role === "admin" ? <Badge variant="secondary">Admin</Badge> : null}
                  </p>
                  <p className="truncate text-small text-muted-foreground">
                    {t.email} · {t.courses} {t.courses === 1 ? "course" : "courses"} · last used AI tools:{" "}
                    {formatRelative(t.lastActiveAt).toLowerCase()}
                  </p>
                </div>
                <DepartmentSelect
                  target="teacher"
                  id={t.id}
                  value={t.departmentId}
                  departments={options}
                  label={`Department for ${t.fullName || t.email}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
