"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type FormState } from "@/lib/teacher/schemas";
import { examInfoSchema } from "./schemas";
import { parseSyllabus } from "./syllabus";

/**
 * Publish (or clear) a course's official syllabus topics, exam pattern and
 * exam date. Written with the teacher's own client, so row-level security
 * decides: only the course teacher may change it. Students' plans use it the
 * next time they plan.
 */
export async function saveExamInfo(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(["teacher", "admin"]);
  const parsed = examInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { courseId, pattern, examDate } = parsed.data;
  const syllabus = parseSyllabus(parsed.data.topics);
  if (syllabus.error) return { status: "error", fieldErrors: { topics: syllabus.error } };

  const db = await createClient();
  if (!syllabus.topics.length && !pattern && !examDate) {
    const { error } = await db.from("course_exam_info").delete().eq("course_id", courseId);
    if (error) return { status: "error", message: "That didn't save. Please try again in a moment." };
    refresh();
    return { status: "success", message: "Cleared. Plans use the course notes and each student's own topics." };
  }
  const { data, error } = await db
    .from("course_exam_info")
    .upsert(
      { course_id: courseId, topics: syllabus.topics, pattern, exam_date: examDate || null, updated_at: new Date().toISOString() },
      { onConflict: "course_id" },
    )
    .select("course_id");
  if (error || !data?.length) return { status: "error", message: "That didn't save. Please try again in a moment." };
  refresh();
  return { status: "success", message: "Published. Students' plans use it the next time they plan." };
}
