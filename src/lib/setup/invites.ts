import "server-only";
import { after } from "next/server";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/teacher/queries";
import { inviteHtml, inviteSubject, inviteText } from "./invite-email";
import { parseRoster, type ParsedRoster, type RosterIssue } from "./roster";
import type { TeacherCourse } from "./server";

/**
 * Class-list import (S22). For each row of the CSV: a student who already has
 * a SafeSight account is enrolled straight away; anyone else gets a pending
 * invite and joins when they sign up (or sign in) with that email
 * (`claim_course_invites`). Emails go out in the background when an email
 * provider is configured; otherwise the page offers the invite text to share.
 */

/** Invites a teacher may send per hour (all courses). */
const INVITES_PER_HOUR = 600;
const SEND_CONCURRENCY = 4;

export function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
}

export type ImportSummary = {
  invited: number;
  added: number;
  alreadyInvited: number;
  alreadyInClass: number;
  skipped: RosterIssue[];
  errors: RosterIssue[];
  warnings: RosterIssue[];
  emailing: boolean;
};

export async function importRoster(course: TeacherCourse, userId: string, csv: string): Promise<ImportSummary | { error: string }> {
  return importRosterRows(course, userId, parseRoster(csv));
}

/** The same import for a list read elsewhere (S25: Google Classroom, Moodle). */
export async function importRosterRows(
  course: Pick<TeacherCourse, "id">,
  userId: string,
  parsed: ParsedRoster,
): Promise<ImportSummary | { error: string }> {
  if (!parsed.rows.length) {
    return { error: parsed.errors[0]?.message ?? "We couldn't find any email addresses in that list." };
  }
  const admin = createAdminClient();

  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await admin
    .from("course_invites")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", userId)
    .gte("created_at", since);
  if ((count ?? 0) + parsed.rows.length > INVITES_PER_HOUR) {
    return { error: "That's a lot of invites in one hour. Please import the rest a little later." };
  }

  const emails = parsed.rows.map((r) => r.email);
  const [accounts, invites, enrolled] = await Promise.all([
    admin.rpc("profiles_by_email", { p_emails: emails }),
    admin.from("course_invites").select("email, status").eq("course_id", course.id).in("email", emails),
    admin.from("enrollments").select("student_id").eq("course_id", course.id),
  ]);
  if (accounts.error || invites.error || enrolled.error) {
    throw new Error(accounts.error?.message ?? invites.error?.message ?? enrolled.error?.message);
  }
  const accountByEmail = new Map(accounts.data.map((a) => [a.email, a]));
  const inviteByEmail = new Map(invites.data.map((i) => [i.email, i]));
  const enrolledIds = new Set(enrolled.data.map((e) => e.student_id));
  const configured = emailConfigured();
  const now = new Date().toISOString();

  const summary: ImportSummary = {
    invited: 0,
    added: 0,
    alreadyInvited: 0,
    alreadyInClass: 0,
    skipped: [],
    errors: parsed.errors,
    warnings: parsed.warnings,
    emailing: configured,
  };
  const inviteRows: {
    course_id: string;
    email: string;
    full_name: string;
    roll_number: string | null;
    status: string;
    email_status: string;
    student_id: string | null;
    joined_at: string | null;
    invited_by: string;
    updated_at: string;
  }[] = [];
  const newEnrollments: { course_id: string; student_id: string }[] = [];
  const rolls: { id: string; roll: string }[] = [];

  for (const row of parsed.rows) {
    const account = accountByEmail.get(row.email);
    if (account && account.role !== "student") {
      summary.skipped.push({ line: row.line, message: `${row.email} is a teacher or admin account, so it wasn't added as a student.` });
      continue;
    }
    if (account && enrolledIds.has(account.id)) {
      summary.alreadyInClass++;
      continue;
    }
    const existing = inviteByEmail.get(row.email);
    if (!account && existing?.status === "pending") {
      summary.alreadyInvited++;
      continue;
    }
    const base = {
      course_id: course.id,
      email: row.email,
      full_name: row.name,
      roll_number: row.rollNumber,
      invited_by: userId,
      updated_at: now,
      email_status: configured ? "queued" : "not_configured",
    };
    if (account) {
      newEnrollments.push({ course_id: course.id, student_id: account.id });
      if (row.rollNumber && !account.roll_number) rolls.push({ id: account.id, roll: row.rollNumber });
      inviteRows.push({ ...base, status: "joined", student_id: account.id, joined_at: now });
      summary.added++;
    } else {
      inviteRows.push({ ...base, status: "pending", student_id: null, joined_at: null });
      summary.invited++;
    }
  }

  if (newEnrollments.length) {
    const { error } = await admin.from("enrollments").upsert(newEnrollments, { onConflict: "course_id,student_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  for (const r of rolls) {
    // Only fills an empty roll number; a student's own choice wins.
    await admin.from("profiles").update({ roll_number: r.roll }).eq("id", r.id).is("roll_number", null);
  }
  const ids: string[] = [];
  for (let i = 0; i < inviteRows.length; i += 200) {
    const { data, error } = await admin
      .from("course_invites")
      .upsert(inviteRows.slice(i, i + 200), { onConflict: "course_id,email" })
      .select("id");
    if (error) throw new Error(error.message);
    ids.push(...data.map((d) => d.id));
  }

  if (configured && ids.length) queueInviteEmails(course.id, ids);
  return summary;
}

/** Sends the invite emails after the response (kept alive with `after()`). */
export function queueInviteEmails(courseId: string, inviteIds: string[]) {
  const job = sendInviteEmails(courseId, inviteIds).catch((error) => console.error("invite emails:", error));
  try {
    after(() => job);
  } catch {
    // Outside a request (scripts): the promise just runs.
  }
}

export async function sendInviteEmails(courseId: string, inviteIds: string[]) {
  const admin = createAdminClient();
  const [{ data: course }, { data: invites }] = await Promise.all([
    admin.from("courses").select("name, code, join_code, teacher:profiles(full_name)").eq("id", courseId).single(),
    admin.from("course_invites").select("id, email, full_name, status").eq("course_id", courseId).in("id", inviteIds),
  ]);
  if (!course || !invites) return;
  const teacher = Array.isArray(course.teacher) ? course.teacher[0] : course.teacher;
  const site = siteUrl();

  const queue = [...invites];
  const worker = async () => {
    for (let invite = queue.shift(); invite; invite = queue.shift()) {
      const input = {
        name: invite.full_name,
        email: invite.email,
        courseName: course.name,
        courseCode: course.code,
        teacherName: teacher?.full_name ?? "",
        joinCode: course.join_code,
        siteUrl: site,
        added: invite.status === "joined",
      };
      const result = await sendEmail({ to: invite.email, subject: inviteSubject(input), text: inviteText(input), html: inviteHtml(input) });
      await admin
        .from("course_invites")
        .update({
          email_status: result.ok ? "sent" : "failed",
          emailed_at: result.ok ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invite.id);
    }
  };
  await Promise.all(Array.from({ length: SEND_CONCURRENCY }, worker));
}

export type InviteRow = {
  id: string;
  email: string;
  name: string;
  rollNumber: string | null;
  status: "pending" | "joined";
  emailStatus: "queued" | "sent" | "failed" | "not_configured";
  createdAt: string;
  joinedAt: string | null;
};

/** The course's invites (RLS: the course teacher), newest first. */
export async function listInvites(db: Db, courseId: string): Promise<InviteRow[]> {
  const { data, error } = await db
    .from("course_invites")
    .select("id, email, full_name, roll_number, status, email_status, created_at, joined_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return data.map((i) => ({
    id: i.id,
    email: i.email,
    name: i.full_name,
    rollNumber: i.roll_number,
    status: i.status === "joined" ? "joined" : "pending",
    emailStatus: (["queued", "sent", "failed", "not_configured"] as const).find((s) => s === i.email_status) ?? "queued",
    createdAt: i.created_at,
    joinedAt: i.joined_at,
  }));
}
