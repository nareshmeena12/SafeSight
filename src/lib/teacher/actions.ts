"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  assignmentSchema,
  courseIdSchema,
  courseSchema,
  fieldErrorsFrom,
  flagStatusSchema,
  optionalCourseIdSchema,
  type FormState,
} from "./schemas";

/**
 * Teacher server actions. Each one checks the role, validates its input with
 * zod and writes through the signed-in client, so row-level security decides
 * what may change (a teacher can only touch their own courses).
 */

const tryAgain = "That didn't save. Please try again in a moment.";

async function teacher() {
  const user = await requireRole(["teacher", "admin"]);
  return { user, db: await createClient() };
}

export async function saveCourse(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = courseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { user, db } = await teacher();
  const { courseId, name, code } = parsed.data;

  if (courseId) {
    const { data, error } = await db.from("courses").update({ name, code }).eq("id", courseId).select("id");
    if (error || data.length === 0) return { status: "error", message: tryAgain };
    refresh();
    return { status: "success", message: "Course updated." };
  }

  const { data, error } = await db
    .from("courses")
    .insert({ teacher_id: user.id, name, code })
    .select("id")
    .single();
  if (error) return { status: "error", message: tryAgain };
  redirect(`/teacher/courses/${data.id}`);
}

export async function newJoinCode(formData: FormData): Promise<void> {
  const parsed = courseIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db } = await teacher();
  // Retry on the rare clash with another course's code.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomJoinCode();
    const { error } = await db.from("courses").update({ join_code: code }).eq("id", parsed.data.courseId);
    if (!error) break;
  }
  refresh();
}

function randomJoinCode() {
  // No 0/O or 1/I, so codes read cleanly off a projector.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function saveAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { db } = await teacher();
  const { courseId, assignmentId, title, instructions, aiMode, teacherNotes, dueAt } = parsed.data;
  const row = { title, instructions, ai_mode: aiMode, due_at: dueAt };

  const { data, error } = assignmentId
    ? await db.from("assignments").update(row).eq("id", assignmentId).eq("course_id", courseId).select("id")
    : await db.from("assignments").insert({ ...row, course_id: courseId }).select("id");
  if (error || data.length === 0) return { status: "error", message: tryAgain };

  // Notes for Sage are teacher-only, so they live in their own table.
  const notes = await db
    .from("assignment_teacher_notes")
    .upsert(
      { assignment_id: data[0].id, notes: teacherNotes, updated_at: new Date().toISOString() },
      { onConflict: "assignment_id" },
    );
  if (notes.error) {
    refresh();
    return { status: "error", message: "The assignment saved, but the notes for Sage didn't. Please try again." };
  }
  refresh();
  return { status: "success", message: assignmentId ? "Assignment updated." : "Assignment created." };
}

export async function deleteAssignment(formData: FormData): Promise<void> {
  const parsed = assignmentSchema.pick({ courseId: true, assignmentId: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !parsed.data.assignmentId) return;
  const { db } = await teacher();
  await db.from("assignments").delete().eq("id", parsed.data.assignmentId).eq("course_id", parsed.data.courseId);
  refresh();
}

export async function setFlagStatus(formData: FormData): Promise<void> {
  const parsed = flagStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db } = await teacher();
  const { flagId, status } = parsed.data;
  await db
    .from("flags")
    .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
    .eq("id", flagId);
  refresh();
}

/** Recompute weekly_metrics (and the Reliance Score) for the teacher's courses. */
export async function refreshMetrics(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = optionalCourseIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: tryAgain };
  const { db } = await teacher();
  const { error } = await db.rpc("refresh_weekly_metrics", {
    p_course_id: parsed.data.courseId ?? undefined,
    p_weeks: 8,
  });
  if (error) return { status: "error", message: "We couldn't update the numbers just now. Please try again." };
  refresh();
  return { status: "success", message: "Numbers are up to date." };
}
