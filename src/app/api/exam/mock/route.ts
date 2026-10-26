import { NextResponse } from "next/server";
import { busyMessage, fail } from "@/app/api/learning/respond";
import { aiStatus } from "@/lib/ai/provider";
import { getCurrentUser } from "@/lib/auth/dal";
import { createMockTest } from "@/lib/exam/mock";
import { mockRequestSchema } from "@/lib/exam/schemas";
import { allowLearningCall } from "@/lib/learning/usage";
import { readCourse } from "@/lib/sage/data";
import { createClient } from "@/lib/supabase/server";

/** Two parallel model calls (and one more round if questions were rejected). */
export const maxDuration = 60;

/** POST /api/exam/mock — write a timed mock test for one of the student's plans; the clock starts when it is ready. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in again.");
  if (user.role !== "student") return fail(403, "Mock tests are for students.");
  const parsed = mockRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "That request didn't come through.");
  if (!aiStatus().chat) return fail(503, "Mock tests aren't switched on yet. The SafeSight team is finishing the setup — please check back soon.");

  // Row-level security: the student's own plan, in a course they're enrolled in.
  const db = await createClient();
  const { data: plan } = await db.from("exam_plans").select("id, course_id, topics").eq("id", parsed.data.planId).maybeSingle();
  if (!plan) return fail(404, "We couldn't find this plan.");
  const course = await readCourse(db, plan.course_id);
  if (!course) return fail(404, "We couldn't find this course in your list.");
  // One test at a time: finish (or let the clock run out on) the open one first.
  const { data: open } = await db
    .from("mock_tests")
    .select("id")
    .eq("student_id", user.id)
    .is("submitted_at", null)
    .gt("ends_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (open) return NextResponse.json({ testId: open.id, resumed: true });
  if (!(await allowLearningCall(user.id, "mock_generate"))) return fail(429, busyMessage);

  try {
    const result = await createMockTest({ studentId: user.id, course, plan, size: parsed.data.size });
    if (!result.ok) return fail(result.status, result.message);
    return NextResponse.json({ testId: result.testId });
  } catch (error) {
    console.error("mock test:", error);
    return fail(500, "Sage couldn't write your mock test just now. Please try again in a moment.");
  }
}
