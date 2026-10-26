"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type FormState } from "@/lib/teacher/schemas";
import { readNumberSet } from "./data";
import { numberSetSchema, parseAnswer } from "./numbers";

/** Server actions for per-student numbers (S18). Every input is checked with zod. */

const tryAgain = "That didn't save. Please try again in a moment.";

const setFormSchema = z.object({
  courseId: z.uuid(),
  assignmentId: z.uuid(),
  /** The whole number set as JSON, built by the form. */
  set: z.string().max(20_000),
});

/** Variables with ranges and the answer formula (course teacher only, under RLS). */
export async function saveNumberSet(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(["teacher"]);
  const form = setFormSchema.safeParse(Object.fromEntries(formData));
  if (!form.success) return { status: "error", message: tryAgain };
  let json: unknown;
  try {
    json = JSON.parse(form.data.set);
  } catch {
    return { status: "error", message: tryAgain };
  }
  const parsed = numberSetSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    // Point at the first problem in plain words; the form shows it at the top.
    const first = parsed.error.issues[0];
    const where = first.path[0] === "variables" && typeof first.path[1] === "number" ? `Variable ${first.path[1] + 1}: ` : "";
    return { status: "error", message: `${where}${first.message}`, fieldErrors };
  }

  const db = await createClient();
  // RLS proves the assignment is in one of this teacher's courses.
  const { data: assignment } = await db
    .from("assignments")
    .select("id")
    .eq("id", form.data.assignmentId)
    .eq("course_id", form.data.courseId)
    .maybeSingle();
  if (!assignment) return { status: "error", message: "This assignment wasn't found in your courses." };

  const s = parsed.data;
  const { error } = await db.from("assignment_number_sets").upsert(
    {
      assignment_id: assignment.id,
      variables: s.variables,
      formula: s.formula,
      answer_label: s.answerLabel,
      answer_unit: s.answerUnit,
      tolerance_pct: s.tolerancePct,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "assignment_id" },
  );
  if (error) return { status: "error", message: tryAgain };
  refresh();
  return { status: "success", message: "Saved. Every student now sees their own numbers." };
}

export async function removeNumberSet(formData: FormData): Promise<void> {
  await requireRole(["teacher"]);
  const parsed = setFormSchema.pick({ assignmentId: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const db = await createClient();
  await db.from("assignment_number_sets").delete().eq("assignment_id", parsed.data.assignmentId);
  refresh();
}

const answerSchema = z.object({
  assignmentId: z.uuid(),
  answer: z.string().trim().min(1, "Type your answer first.").max(100, "Keep the answer under 100 characters."),
});

/** A student's final answer. Editable until they submit their written work for the assignment. */
export async function saveNumericAnswer(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole(["student"]);
  const parsed = answerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { assignmentId, answer } = parsed.data;

  const db = await createClient();
  // Under RLS: the assignment is in one of the student's courses, and their own submission.
  const [{ data: assignment }, { data: submission }] = await Promise.all([
    db.from("assignments").select("id, ai_mode").eq("id", assignmentId).maybeSingle(),
    db.from("submissions").select("submitted_at").eq("assignment_id", assignmentId).eq("student_id", user.id).maybeSingle(),
  ]);
  if (!assignment) return { status: "error", message: "This assignment wasn't found in your courses." };
  if (submission?.submitted_at) return { status: "error", message: "This work is already submitted, so the answer can't change." };
  if (!(await readNumberSet(assignmentId))) return { status: "error", message: "This assignment doesn't take a number answer." };

  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("numeric_answers")
    .upsert(
      { assignment_id: assignmentId, student_id: user.id, answer_text: answer, answer_value: parseAnswer(answer), updated_at: now },
      { onConflict: "assignment_id,student_id" },
    );
  if (error) return { status: "error", message: tryAgain };
  refresh();
  return {
    status: "success",
    message: parseAnswer(answer) === null ? "Saved. We couldn't read a number in it, so check it's what you meant." : "Answer saved.",
  };
}
