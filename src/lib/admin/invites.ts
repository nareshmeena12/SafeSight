import "server-only";
import { after } from "next/server";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/setup/invites";
import { createAdminClient } from "@/lib/supabase/admin";
import { teacherInviteHtml, teacherInviteSubject, teacherInviteText } from "./invite-email";
import type { Institution } from "./queries";
import { MAX_INVITES_AT_ONCE, parseTeacherInvites } from "./schemas";

/**
 * Admin invites teachers (S23). Written with the service role after the
 * caller was checked as this institution's admin. Per email:
 *   * an account in no institution or this one → made a teacher here now
 *     (and moved into the department, if one was picked);
 *   * an admin, an account of another institution, or a student already in a
 *     course → skipped, with the reason;
 *   * no account → a pending invite, claimed when that email signs up or logs
 *     in (`claim_teacher_invites`).
 * Emails go out in the background when an email provider is configured.
 */

const INVITES_PER_HOUR = 200;
const SEND_CONCURRENCY = 4;

export type InviteSummary = {
  invited: number;
  added: number;
  alreadyInvited: number;
  skipped: { email: string; reason: string }[];
  invalid: string[];
  emailing: boolean;
};

export async function inviteTeachers(
  institution: Institution,
  adminId: string,
  text: string,
  departmentId: string | null,
): Promise<InviteSummary | { error: string }> {
  const { invites, invalid } = parseTeacherInvites(text);
  if (!invites.length) return { error: "We couldn't find an email address in that list." };
  if (invites.length > MAX_INVITES_AT_ONCE) {
    return { error: `Invite up to ${MAX_INVITES_AT_ONCE} teachers at a time.` };
  }
  const admin = createAdminClient();

  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await admin
    .from("teacher_invites")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", adminId)
    .gte("updated_at", since);
  if ((count ?? 0) + invites.length > INVITES_PER_HOUR) {
    return { error: "That's a lot of invites in one hour. Please send the rest a little later." };
  }

  if (departmentId) {
    const { data } = await admin.from("departments").select("id").eq("id", departmentId).eq("institution_id", institution.id).maybeSingle();
    if (!data) return { error: "Choose one of your departments." };
  }

  const emails = invites.map((i) => i.email);
  const [accounts, existing] = await Promise.all([
    admin.rpc("profiles_by_email", { p_emails: emails }),
    admin.from("teacher_invites").select("email, status").eq("institution_id", institution.id).in("email", emails),
  ]);
  if (accounts.error || existing.error) return { error: "We couldn't send the invites just now. Please try again." };
  const ids = (accounts.data ?? []).map((a) => a.id);
  const [profiles, enrolled] = ids.length
    ? await Promise.all([
        admin.from("profiles").select("id, institution_id").in("id", ids),
        admin.from("enrollments").select("student_id").in("student_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const institutionOf = new Map((profiles.data ?? []).map((p) => [p.id, p.institution_id]));
  const inCourse = new Set((enrolled.data ?? []).map((e) => e.student_id));
  const accountByEmail = new Map((accounts.data ?? []).map((a) => [a.email, a]));
  const pendingAlready = new Set((existing.data ?? []).filter((i) => i.status === "pending").map((i) => i.email));

  const summary: InviteSummary = { invited: 0, added: 0, alreadyInvited: 0, skipped: [], invalid, emailing: false };
  const toEmail: string[] = [];
  const now = new Date().toISOString();

  for (const invite of invites) {
    const account = accountByEmail.get(invite.email);
    if (account) {
      const theirs = institutionOf.get(account.id) ?? null;
      if (account.role === "admin") {
        summary.skipped.push({ email: invite.email, reason: "already an admin" });
        continue;
      }
      if (theirs && theirs !== institution.id) {
        summary.skipped.push({ email: invite.email, reason: "belongs to another institution" });
        continue;
      }
      if (account.role === "student" && inCourse.has(account.id)) {
        summary.skipped.push({ email: invite.email, reason: "is a student in a course — write to us to change the account" });
        continue;
      }
      const update = await admin
        .from("profiles")
        .update({ role: "teacher", institution_id: institution.id, ...(departmentId ? { department_id: departmentId } : {}) })
        .eq("id", account.id);
      if (update.error) {
        summary.skipped.push({ email: invite.email, reason: "couldn't be updated — try again" });
        continue;
      }
      await admin.from("courses").update({ institution_id: institution.id }).eq("teacher_id", account.id).is("institution_id", null);
      if (departmentId) {
        await admin
          .from("courses")
          .update({ department_id: departmentId })
          .eq("teacher_id", account.id)
          .eq("institution_id", institution.id)
          .is("department_id", null);
      }
      await admin.from("teacher_invites").upsert(
        {
          institution_id: institution.id,
          department_id: departmentId,
          email: invite.email,
          full_name: invite.name,
          status: "joined",
          teacher_id: account.id,
          invited_by: adminId,
          joined_at: now,
          updated_at: now,
          email_status: emailConfigured() ? "queued" : "not_configured",
        },
        { onConflict: "institution_id,email" },
      );
      summary.added++;
      toEmail.push(invite.email);
      continue;
    }

    const { error } = await admin.from("teacher_invites").upsert(
      {
        institution_id: institution.id,
        department_id: departmentId,
        email: invite.email,
        full_name: invite.name,
        status: "pending",
        invited_by: adminId,
        updated_at: now,
        email_status: emailConfigured() ? "queued" : "not_configured",
      },
      { onConflict: "institution_id,email" },
    );
    if (error) {
      summary.skipped.push({ email: invite.email, reason: "couldn't be saved — try again" });
      continue;
    }
    if (pendingAlready.has(invite.email)) summary.alreadyInvited++;
    else summary.invited++;
    toEmail.push(invite.email);
  }

  if (emailConfigured() && toEmail.length) {
    summary.emailing = true;
    queueTeacherInviteEmails(institution, toEmail);
  }
  return summary;
}

/** Sends the invite emails after the response (kept alive with `after()`). */
export function queueTeacherInviteEmails(institution: Institution, emails: string[]) {
  const job = sendTeacherInviteEmails(institution, emails).catch((error) => console.error("teacher invite emails:", error));
  try {
    after(() => job);
  } catch {
    // Outside a request: the promise just runs.
  }
}

async function sendTeacherInviteEmails(institution: Institution, emails: string[]) {
  const admin = createAdminClient();
  const { data: invites } = await admin
    .from("teacher_invites")
    .select("id, email, full_name, status, department:departments(name), inviter:profiles!teacher_invites_invited_by_fkey(full_name)")
    .eq("institution_id", institution.id)
    .in("email", emails);
  if (!invites) return;
  const site = siteUrl();
  const queue = [...invites];
  const worker = async () => {
    for (let invite = queue.shift(); invite; invite = queue.shift()) {
      const department = Array.isArray(invite.department) ? invite.department[0] : invite.department;
      const inviter = Array.isArray(invite.inviter) ? invite.inviter[0] : invite.inviter;
      const input = {
        name: invite.full_name,
        email: invite.email,
        institutionName: institution.name,
        departmentName: department?.name ?? "",
        adminName: inviter?.full_name ?? "",
        siteUrl: site,
        added: invite.status === "joined",
      };
      const result = await sendEmail({
        to: invite.email,
        subject: teacherInviteSubject(input),
        text: teacherInviteText(input),
        html: teacherInviteHtml(input),
      });
      await admin
        .from("teacher_invites")
        .update({ email_status: result.ok ? "sent" : "failed", updated_at: new Date().toISOString() })
        .eq("id", invite.id);
    }
  };
  await Promise.all(Array.from({ length: SEND_CONCURRENCY }, worker));
}

/** The text to share by hand when email isn't set up (or as well). */
export function shareableInvite(institution: Institution, invite: { email: string; fullName: string; status: string }, departmentName: string, adminName: string) {
  return teacherInviteText({
    name: invite.fullName,
    email: invite.email,
    institutionName: institution.name,
    departmentName,
    adminName,
    siteUrl: siteUrl(),
    added: invite.status === "joined",
  });
}
