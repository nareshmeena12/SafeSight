import { NextResponse } from "next/server";
import { aiStatus } from "@/lib/ai/provider";
import { getCurrentUser } from "@/lib/auth/dal";
import { createPracticeSet } from "@/lib/learning/practice";
import { practiceRequestSchema } from "@/lib/learning/schemas";
import { allowLearningCall } from "@/lib/learning/usage";
import { readCourse } from "@/lib/sage/data";
import { createClient } from "@/lib/supabase/server";
import { busyMessage, fail } from "../respond";

/** Generation can take two model calls plus a notes search. */
export const maxDuration = 60;

/**
 * POST /api/learning/practice — start "Practice this", "Review before exam"
 * or a prerequisite refresher for one of the student's courses. Returns the
 * new set's id; the page at /student/learning/practice/<id> runs it.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in again.");
  if (user.role !== "student") return fail(403, "Practice is for students.");
  const parsed = practiceRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "That request didn't come through.");
  if (!aiStatus().chat) return fail(503, "Practice isn't switched on yet. The SafeSight team is finishing the setup — please check back soon.");

  // Row-level security: only a course the student is enrolled in comes back.
  const course = await readCourse(await createClient(), parsed.data.courseId);
  if (!course) return fail(404, "We couldn't find this course in your list.");
  const feature = parsed.data.kind === "refresher" ? "refresher_generate" : "practice_generate";
  if (!(await allowLearningCall(user.id, feature))) return fail(429, busyMessage);

  try {
    const result = await createPracticeSet({ studentId: user.id, course, ...parsed.data });
    if (!result.ok) return fail(result.status, result.message);
    return NextResponse.json({ setId: result.setId });
  } catch (error) {
    console.error("practice:", error);
    return fail(500, "Sage couldn't make practice problems just now. Please try again in a moment.");
  }
}
