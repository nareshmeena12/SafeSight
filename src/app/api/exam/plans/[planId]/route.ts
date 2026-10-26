import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/app/api/learning/respond";
import { getCurrentUser } from "@/lib/auth/dal";
import { istToday } from "@/lib/exam/plan";
import { savePlan } from "@/lib/exam/plans";
import { examDateProblem, planDaysSchema, planPatchSchema, planTopicsSchema } from "@/lib/exam/schemas";
import { readCourse } from "@/lib/sage/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

async function ownPlan(planId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: fail(401, "Please sign in again.") } as const;
  if (user.role !== "student") return { error: fail(403, "Exam plans are for students.") } as const;
  if (!z.uuid().safeParse(planId).success) return { error: fail(404, "We couldn't find this plan.") } as const;
  // Row-level security: the student's own plan only.
  const db = await createClient();
  const { data: plan } = await db
    .from("exam_plans")
    .select("id, course_id, exam_date, minutes_per_day, days, topics, done, checked, updated_at")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return { error: fail(404, "We couldn't find this plan.") } as const;
  return { user, db, plan } as const;
}

/**
 * PATCH /api/exam/plans/<id> — tick a task, mark a topic as revised, or
 * rebuild the plan from today with the latest mastery and mistakes.
 */
export async function PATCH(req: Request, { params }: RouteContext<"/api/exam/plans/[planId]">) {
  const own = await ownPlan((await params).planId);
  if ("error" in own) return own.error;
  const { user, db, plan } = own;
  const parsed = planPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "That change didn't come through.");
  const admin = createAdminClient();

  if ("taskId" in parsed.data) {
    const { taskId, done } = parsed.data;
    const days = planDaysSchema.safeParse(plan.days).data ?? [];
    if (!days.some((d) => d.tasks.some((t) => t.id === taskId))) return fail(404, "That task isn't in your plan any more. Reload to see the latest plan.");
    const next = done ? [...new Set([...plan.done, taskId])] : plan.done.filter((id) => id !== taskId);
    const { error } = await admin.from("exam_plans").update({ done: next }).eq("id", plan.id);
    if (error) return fail(500, "That didn't save. Please try again.");
    return NextResponse.json({ done: next });
  }

  if ("topicKey" in parsed.data) {
    const { topicKey, checked } = parsed.data;
    const topics = planTopicsSchema.safeParse(plan.topics).data ?? [];
    if (!topics.some((t) => t.key === topicKey)) return fail(404, "That topic isn't in your plan any more. Reload to see the latest plan.");
    const next = checked ? [...new Set([...plan.checked, topicKey])] : plan.checked.filter((k) => k !== topicKey);
    const { error } = await admin.from("exam_plans").update({ checked: next }).eq("id", plan.id);
    if (error) return fail(500, "That didn't save. Please try again.");
    return NextResponse.json({ checked: next });
  }

  // Rebuild with the same exam date and daily time.
  const problem = examDateProblem(plan.exam_date, istToday());
  if (problem) return fail(400, "The exam date has passed — make a new plan for your next exam.");
  if (Date.now() - Date.parse(plan.updated_at) < 15_000) return NextResponse.json({ planId: plan.id });
  const course = await readCourse(db, plan.course_id);
  if (!course) return fail(404, "We couldn't find this course in your list.");
  try {
    await savePlan({ studentId: user.id, course, examDate: plan.exam_date, minutesPerDay: plan.minutes_per_day });
    return NextResponse.json({ planId: plan.id });
  } catch (error) {
    console.error("exam plan rebuild:", error);
    return fail(500, "We couldn't update your plan just now. Please try again in a moment.");
  }
}

/** DELETE /api/exam/plans/<id> — remove the plan (its mock tests stay on the Exam prep page). */
export async function DELETE(_req: Request, { params }: RouteContext<"/api/exam/plans/[planId]">) {
  const own = await ownPlan((await params).planId);
  if ("error" in own) return own.error;
  const { error } = await createAdminClient().from("exam_plans").delete().eq("id", own.plan.id).eq("student_id", own.user.id);
  if (error) return fail(500, "That didn't go through. Please try again.");
  return NextResponse.json({ ok: true });
}
