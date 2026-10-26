import { NextResponse } from "next/server";
import { z } from "zod";
import { busyMessage, fail } from "@/app/api/learning/respond";
import { getCurrentUser } from "@/lib/auth/dal";
import { gradeMockTest } from "@/lib/exam/mock";
import { allowLearningCall } from "@/lib/learning/usage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** One model call for the written answers. */
export const maxDuration = 60;

/** A test handed in this long ago without marks (a crash mid-grading) may be marked again. */
const STUCK_MS = 90_000;

/**
 * POST /api/exam/mock/<testId>/submit — hand the test in (or the clock ran
 * out) and mark it. Only the first call marks; a test whose marking failed
 * part-way can be marked again after a short wait.
 */
export async function POST(_req: Request, { params }: RouteContext<"/api/exam/mock/[testId]/submit">) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in again.");
  if (user.role !== "student") return fail(403, "Mock tests are for students.");
  const { testId } = await params;
  if (!z.uuid().safeParse(testId).success) return fail(404, "We couldn't find this test.");

  // Row-level security: the student's own test and its items only.
  const db = await createClient();
  const [{ data: test }, { data: items }] = await Promise.all([
    db.from("mock_tests").select("id, course_id, submitted_at, graded_at").eq("id", testId).maybeSingle(),
    db.from("mock_test_items").select("id, kind, format, topic, question, marks, answer, choice").eq("test_id", testId).order("position"),
  ]);
  if (!test) return fail(404, "We couldn't find this test.");
  if (test.graded_at) return NextResponse.json({ ok: true, already: true });

  const admin = createAdminClient();
  const now = new Date();
  if (test.submitted_at) {
    if (now.getTime() - Date.parse(test.submitted_at) < STUCK_MS) return fail(409, "Your test is being marked. This page will update in a moment.");
    const { data: claimed } = await admin
      .from("mock_tests")
      .update({ submitted_at: now.toISOString() })
      .eq("id", test.id)
      .eq("submitted_at", test.submitted_at)
      .is("graded_at", null)
      .select("id");
    if (!claimed?.length) return fail(409, "Your test is being marked. This page will update in a moment.");
  } else {
    // Claim the hand-in, so two tabs (or the timer and the button) mark it once.
    const { data: claimed } = await admin.from("mock_tests").update({ submitted_at: now.toISOString() }).eq("id", test.id).is("submitted_at", null).select("id");
    if (!claimed?.length) return fail(409, "Your test is being marked. This page will update in a moment.");
  }
  // The limit only decides whether the written answers get the model; marking always finishes.
  const modelAllowed = await allowLearningCall(user.id, "mock_grade");
  try {
    const result = await gradeMockTest({ studentId: user.id, test, items: items ?? [], useModel: modelAllowed });
    if (!result.ok) return fail(result.status, result.message);
    return NextResponse.json({ ...result, note: modelAllowed ? undefined : busyMessage });
  } catch (error) {
    console.error("mock grade:", error);
    return fail(500, "Sage couldn't mark your test just now. Your answers are saved — try again in a minute.");
  }
}
