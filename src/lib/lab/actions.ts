"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { policyProblemFromDbError } from "@/lib/admin/policy";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type FormState } from "@/lib/teacher/schemas";
import { writeLabReports } from "./reports";
import {
  blocklistSchema,
  extendSchema,
  labSessionIdSchema,
  labSessionSchema,
  rollNumberFormSchema,
} from "./schemas";
import { effectiveEnd } from "./status";
import { randomSessionCode } from "./tokens";

/**
 * Live Lab Mode server actions. Teachers write through their own client, so
 * row-level security limits them to their courses' sessions (and the column
 * grant to title, room, end time, blocklist and ended_at).
 */

const tryAgain = "That didn't save. Please try again in a moment.";

async function teacher() {
  const user = await requireRole(["teacher", "admin"]);
  return { user, db: await createClient() };
}

export async function createLabSession(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = labSessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { courseId, title, room, startsAt, endsAt, blocklist } = parsed.data;
  if (endsAt.getTime() <= Date.now()) {
    return { status: "error", fieldErrors: { startsAt: "That session would already be over. Pick a later time." } };
  }
  const { user, db } = await teacher();

  // Retry on the rare clash with another session's code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from("lab_sessions")
      .insert({
        course_id: courseId,
        created_by: user.id,
        title,
        room,
        code: randomSessionCode(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        blocklist,
      })
      .select("id")
      .single();
    if (!error) redirect(`/teacher/lab/${data.id}`);
    // S23: the department's AI policy may switch Lab Mode off.
    if (policyProblemFromDbError(error) === "lab") {
      return {
        status: "error",
        message: "Lab Mode is switched off for this course by your college's AI policy. Your admin can turn it on.",
      };
    }
    if (error.code !== "23505") {
      // 42501: RLS said no — the course isn't this teacher's.
      return { status: "error", message: error.code === "42501" ? "Choose one of your courses." : tryAgain };
    }
  }
  return { status: "error", message: tryAgain };
}

/** Ends the session now. The extensions stop on their next heartbeat. */
export async function endLabSession(formData: FormData): Promise<void> {
  const parsed = labSessionIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db } = await teacher();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("lab_sessions")
    .update({ ended_at: now })
    .eq("id", parsed.data.sessionId)
    .is("ended_at", null)
    .select("id, starts_at, ends_at, ended_at")
    .maybeSingle();
  if (error || !data) return;
  // Write summaries after the last batches arrive (extensions beat every 10 s).
  after(async () => {
    await new Promise((r) => setTimeout(r, 15_000));
    try {
      await writeLabReports(data);
    } catch (e) {
      console.error("lab reports failed", e);
    }
  });
  refresh();
}

/** Adds time to a session that hasn't ended. */
export async function extendLabSession(formData: FormData): Promise<void> {
  const parsed = extendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db } = await teacher();
  const { data } = await db
    .from("lab_sessions")
    .select("starts_at, ends_at, ended_at")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();
  if (!data || Date.now() >= effectiveEnd(data)) return;
  const next = new Date(Date.parse(data.ends_at) + parsed.data.minutes * 60_000);
  // The table allows at most 12 hours per session.
  if (next.getTime() - Date.parse(data.starts_at) > 12 * 3_600_000) return;
  await db.from("lab_sessions").update({ ends_at: next.toISOString() }).eq("id", parsed.data.sessionId);
  refresh();
}

export async function updateLabBlocklist(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = blocklistSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { db } = await teacher();
  const { data, error } = await db
    .from("lab_sessions")
    .update({ blocklist: parsed.data.blocklist })
    .eq("id", parsed.data.sessionId)
    .select("id");
  if (error || data.length === 0) return { status: "error", message: tryAgain };
  refresh();
  return { status: "success", message: "Saved. Lab PCs pick it up within 10 seconds." };
}

export async function deleteLabSession(formData: FormData): Promise<void> {
  const parsed = labSessionIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db } = await teacher();
  await db.from("lab_sessions").delete().eq("id", parsed.data.sessionId);
  redirect("/teacher/lab");
}

/** Prepares (or refreshes) the summaries for an ended session. */
export async function prepareLabReports(formData: FormData): Promise<void> {
  const parsed = labSessionIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db } = await teacher();
  // Reading under RLS proves the teacher runs this session.
  const { data } = await db
    .from("lab_sessions")
    .select("id, starts_at, ends_at, ended_at")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();
  if (!data) return;
  await writeLabReports(data);
  refresh();
}

/** A student saves the roll number they type on lab PCs. */
export async function saveRollNumber(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = rollNumberFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  await requireRole(["student"]);
  const db = await createClient();
  const { error } = await db.rpc("set_my_roll_number", { p_roll_number: parsed.data.rollNumber });
  if (error) return { status: "error", message: tryAgain };
  refresh();
  return { status: "success", message: parsed.data.rollNumber ? "Roll number saved." : "Roll number removed." };
}
