import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { answerItem } from "@/lib/learning/practice";
import { answerRequestSchema } from "@/lib/learning/schemas";
import { allowLearningCall } from "@/lib/learning/usage";
import { activeAssignments } from "@/lib/sage/data";
import { createClient } from "@/lib/supabase/server";
import { busyMessage, fail } from "../../../../respond";

export const maxDuration = 60;

/** POST /api/learning/practice/<setId>/items/<itemId> — grade one answer, with feedback and the worked solution. */
export async function POST(req: Request, { params }: RouteContext<"/api/learning/practice/[setId]/items/[itemId]">) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in again.");
  if (user.role !== "student") return fail(403, "Practice is for students.");
  const { setId, itemId } = await params;
  if (!z.uuid().safeParse(setId).success || !z.uuid().safeParse(itemId).success) return fail(404, "We couldn't find this question.");
  const parsed = answerRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Write an answer first.");

  // Row-level security: the student's own set and item only.
  const db = await createClient();
  const [{ data: set }, { data: item }] = await Promise.all([
    db.from("practice_sets").select("id, kind, course_id, topic, skill, targets").eq("id", setId).maybeSingle(),
    db.from("practice_items").select("id, set_id, format, question, options, topic, answered_at").eq("id", itemId).maybeSingle(),
  ]);
  if (!set || !item || item.set_id !== set.id) return fail(404, "We couldn't find this question.");
  if (item.answered_at) return fail(409, "You've already answered this one. Reload to see your feedback.");
  if (item.format === "open" && !(await allowLearningCall(user.id, "practice_grade"))) return fail(429, busyMessage);

  try {
    const result = await answerItem({
      studentId: user.id,
      item,
      set,
      answer: parsed.data.answer,
      choice: parsed.data.choice,
      assignments: await activeAssignments(set.course_id),
    });
    if (!result.ok) return fail(result.status, result.message);
    return NextResponse.json(result);
  } catch (error) {
    console.error("practice answer:", error);
    return fail(500, "Sage couldn't check this answer just now. Please try again in a moment.");
  }
}
