"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/dal";
import { emailConfigured } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/teacher/schemas";
import { importRoster, queueInviteEmails, type ImportSummary } from "./invites";
import { linkCourseNotes, readTopicMap, setSuggestionStatus, teacherCourse } from "./server";
import { saveTopicMapSchema, withSavedIds } from "./topic-map";

/**
 * Course setup server actions (S22). Each checks the role, validates with zod
 * and confirms the teacher owns the course under row-level security before
 * anything is written.
 */

const tryAgain = "That didn't save. Please try again in a moment.";

async function owner(courseId: string) {
  const user = await requireRole(["teacher", "admin"]);
  const db = await createClient();
  const course = await teacherCourse(db, user.id, courseId);
  return course ? { user, db, course } : null;
}

export async function saveTopicMap(_prev: FormState, formData: FormData): Promise<FormState> {
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { status: "error", message: "That didn't come through. Please reload the page." };
  }
  const parsed = saveTopicMapSchema.safeParse(payload);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? tryAgain };
  const ctx = await owner(parsed.data.courseId);
  if (!ctx) return { status: "error", message: "Only this course's teacher can change its topic map." };
  const { db, course } = ctx;
  const { courseName, courseCode, units, outcomes } = parsed.data;

  // Keep the ids of topics that stay, so their linked notes and (later) mappings survive.
  const saved = await readTopicMap(db, course.id);
  const map = withSavedIds({ units, outcomes }, saved);
  const { error } = await db.rpc("save_course_topic_map", {
    p_course_id: course.id,
    p_units: map.units,
    p_outcomes: map.outcomes,
  });
  if (error) {
    console.error("save_course_topic_map:", error.message);
    return { status: "error", message: tryAgain };
  }
  if (courseName !== course.name || courseCode !== course.code) {
    await db.from("courses").update({ name: courseName, code: courseCode }).eq("id", course.id);
  }
  const admin = createAdminClient();
  await admin.from("course_syllabi").update({ applied_at: new Date().toISOString() }).eq("course_id", course.id);
  try {
    await linkCourseNotes(course.id);
  } catch (e) {
    console.warn("link notes after save:", e instanceof Error ? e.message : e);
  }
  refresh();
  return { status: "success", message: "Topic map saved." };
}

const courseOnly = z.object({ courseId: z.uuid() });

/** "Keep my saved map": hides the draft read from the syllabus. */
export async function discardSyllabusDraft(formData: FormData): Promise<void> {
  const parsed = courseOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  if (!(await owner(parsed.data.courseId))) return;
  await createAdminClient()
    .from("course_syllabi")
    .update({ applied_at: new Date().toISOString() })
    .eq("course_id", parsed.data.courseId);
  refresh();
}

export async function relinkNotes(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = courseOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: tryAgain };
  if (!(await owner(parsed.data.courseId))) return { status: "error", message: "Only this course's teacher can do this." };
  try {
    const { topics } = await linkCourseNotes(parsed.data.courseId);
    refresh();
    return {
      status: "success",
      message: topics ? `Notes linked to ${topics} ${topics === 1 ? "topic" : "topics"}.` : "No topics matched the notes yet.",
    };
  } catch (e) {
    console.error("link notes:", e);
    return { status: "error", message: "We couldn't link the notes just now. Please try again." };
  }
}

const suggestionSchema = z.object({
  courseId: z.uuid(),
  suggestionId: z.string().min(1).max(64),
  status: z.enum(["used", "dismissed"]),
});

export async function markSuggestion(input: { courseId: string; suggestionId: string; status: "used" | "dismissed" }) {
  const parsed = suggestionSchema.safeParse(input);
  if (!parsed.success) return false;
  if (!(await owner(parsed.data.courseId))) return false;
  const ok = await setSuggestionStatus(parsed.data.courseId, parsed.data.suggestionId, parsed.data.status);
  refresh();
  return ok;
}

// ---------------------------------------------------------------- roster

export type ImportState = { status: "idle" | "error" | "success"; message?: string; summary?: ImportSummary };

const importSchema = z.object({
  courseId: z.uuid(),
  csv: z.string().trim().min(3, "Paste your class list or choose a CSV file.").max(200_000, "That list is too long. Import it in parts."),
});

export async function importClassList(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const parsed = importSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? tryAgain };
  const ctx = await owner(parsed.data.courseId);
  if (!ctx) return { status: "error", message: "Only this course's teacher can invite students." };
  try {
    const result = await importRoster(ctx.course, ctx.user.id, parsed.data.csv);
    if ("error" in result) return { status: "error", message: result.error };
    refresh();
    return { status: "success", summary: result };
  } catch (e) {
    console.error("import roster:", e);
    return { status: "error", message: "We couldn't import the list just now. Please try again." };
  }
}

const inviteSchema = z.object({ courseId: z.uuid(), inviteId: z.uuid() });

export async function resendInvite(formData: FormData): Promise<void> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !emailConfigured()) return;
  if (!(await owner(parsed.data.courseId))) return;
  const { data } = await createAdminClient()
    .from("course_invites")
    .update({ email_status: "queued", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.inviteId)
    .eq("course_id", parsed.data.courseId)
    .select("id");
  if (data?.length) queueInviteEmails(parsed.data.courseId, [parsed.data.inviteId]);
  refresh();
}

export async function removeInvite(formData: FormData): Promise<void> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await requireRole(["teacher", "admin"]);
  // Row-level security: only the course teacher may remove an invite. Joined students stay enrolled.
  await (await createClient())
    .from("course_invites")
    .delete()
    .eq("id", parsed.data.inviteId)
    .eq("course_id", parsed.data.courseId);
  refresh();
}
