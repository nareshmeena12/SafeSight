import "server-only";
import { aiStatus } from "@/lib/ai/provider";
import { generateBrief } from "@/lib/brief/brief";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { weekStart } from "@/lib/teacher/dates";
import { digestHtml, digestSubject, digestText } from "./content";
import { buildDigest, weeklyEmailWanted } from "./digest";

const DAY_MS = 24 * 60 * 60 * 1000;
const BRIEF_CONCURRENCY = 3;

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
}

/**
 * The Monday job (vercel.json cron → /api/cron/weekly-insights): this week's
 * pre-lecture brief for every course with Sage activity in the last 7 days,
 * then each teacher's digest (recorded in teacher_digests; emailed when email
 * is configured and the teacher hasn't turned it off). Safe to re-run: a
 * course with a brief from the last 12 hours and a teacher already emailed
 * this week are skipped. Stops starting new briefs at the deadline; those
 * courses can still prepare one on demand.
 */
export async function runWeeklyInsights({ now = new Date(), deadline }: { now?: Date; deadline: number }) {
  const admin = createAdminClient();
  const week = weekStart(now);
  const summary = { briefs: 0, briefsSkipped: 0, briefsFailed: 0, digests: 0, emailed: 0, emailFailed: 0 };

  const { data: courses, error } = await admin.from("courses").select("id, teacher_id").order("created_at");
  if (error) throw new Error(`courses: ${error.message}`);

  // 1. Briefs.
  if (aiStatus().chat) {
    const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    const recent = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await admin.from("lecture_briefs").select("course_id").eq("week", week).gte("updated_at", recent);
    const done = new Set((existing ?? []).map((b) => b.course_id));
    const queue: { id: string; teacher_id: string }[] = [];
    for (const c of courses) {
      if (done.has(c.id)) {
        summary.briefsSkipped++;
        continue;
      }
      const { count } = await admin
        .from("messages")
        .select("id, conversation:conversations!inner(course_id)", { count: "exact", head: true })
        .eq("role", "user")
        .eq("conversation.course_id", c.id)
        .gte("created_at", since);
      if (count) queue.push(c);
      else summary.briefsSkipped++;
    }
    const workers = Array.from({ length: BRIEF_CONCURRENCY }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        if (Date.now() > deadline) {
          summary.briefsSkipped++;
          continue;
        }
        try {
          const result = await generateBrief({
            courseId: c.id,
            teacherId: c.teacher_id,
            source: "schedule",
            now,
            signal: AbortSignal.timeout(Math.max(1_000, deadline + 60_000 - Date.now())),
          });
          if (result.status === "ok") summary.briefs++;
          else summary.briefsFailed++;
        } catch (e) {
          summary.briefsFailed++;
          console.error("weekly brief failed", c.id, e);
        }
      }
    });
    await Promise.all(workers);
  }

  // 2. Digests, one per teacher with at least one course.
  const teachers = [...new Set(courses.map((c) => c.teacher_id))];
  const configured = emailConfigured();
  const { data: sent } = await admin.from("teacher_digests").select("teacher_id").eq("week", week).eq("email_status", "sent");
  const alreadySent = new Set((sent ?? []).map((d) => d.teacher_id));
  for (const teacherId of teachers) {
    try {
      const content = await buildDigest(admin, teacherId, now);
      let status: "sent" | "not_configured" | "opted_out" | "failed" = "not_configured";
      let errorText: string | null = null;
      let emailedAt: string | null = null;
      if (alreadySent.has(teacherId)) continue;
      if (!(await weeklyEmailWanted(admin, teacherId))) status = "opted_out";
      else if (configured) {
        const { data: user } = await admin.auth.admin.getUserById(teacherId);
        const to = user.user?.email;
        if (!to) {
          status = "failed";
          errorText = "No email address on the account.";
        } else {
          const result = await sendEmail({
            to,
            subject: digestSubject(content),
            text: digestText(content, siteUrl()),
            html: digestHtml(content, siteUrl()),
          });
          status = result.ok ? "sent" : "failed";
          errorText = result.ok ? null : result.error;
          emailedAt = result.ok ? new Date().toISOString() : null;
        }
      }
      const { error: saveError } = await admin
        .from("teacher_digests")
        .upsert(
          { teacher_id: teacherId, week, content, email_status: status, emailed_at: emailedAt, error: errorText },
          { onConflict: "teacher_id,week" },
        );
      if (saveError) throw new Error(saveError.message);
      summary.digests++;
      if (status === "sent") summary.emailed++;
      if (status === "failed") summary.emailFailed++;
    } catch (e) {
      summary.emailFailed++;
      console.error("weekly digest failed", teacherId, e);
    }
  }
  return summary;
}
