import { NextResponse } from "next/server";
import { fail } from "@/app/api/learning/respond";
import { getCurrentUser } from "@/lib/auth/dal";
import { istToday } from "@/lib/exam/plan";
import { savePlan } from "@/lib/exam/plans";
import { examDateProblem, planRequestSchema } from "@/lib/exam/schemas";
import { readCourse } from "@/lib/sage/data";
import { createClient } from "@/lib/supabase/server";

/** Reading topics from the notes can take one model call plus a notes search per topic. */
export const maxDuration = 60;

/** Planning again replaces the plan; this gap stops accidental double submits. */
const REPLAN_GAP_MS = 15_000;

/**
 * POST /api/exam/plans — make (or remake) the student's revision plan for one
 * of their courses. Returns the plan id; /student/exam/<id> shows it.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in again.");
  if (user.role !== "student") return fail(403, "Exam plans are for students.");
  const parsed = planRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "That request didn't come through.");
  const problem = examDateProblem(parsed.data.examDate, istToday());
  if (problem) return fail(400, problem);

  // Row-level security: only a course the student is enrolled in comes back.
  const db = await createClient();
  const course = await readCourse(db, parsed.data.courseId);
  if (!course) return fail(404, "We couldn't find this course in your list.");
  const { data: existing } = await db.from("exam_plans").select("id, updated_at").eq("course_id", course.id).eq("student_id", user.id).maybeSingle();
  if (existing && Date.now() - Date.parse(existing.updated_at) < REPLAN_GAP_MS) return NextResponse.json({ planId: existing.id });

  try {
    const plan = await savePlan({ studentId: user.id, course, examDate: parsed.data.examDate, minutesPerDay: parsed.data.minutesPerDay });
    return NextResponse.json({ planId: plan.id });
  } catch (error) {
    console.error("exam plan:", error);
    return fail(500, "We couldn't make your plan just now. Please try again in a moment.");
  }
}
