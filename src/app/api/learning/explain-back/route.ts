import { NextResponse } from "next/server";
import { aiStatus } from "@/lib/ai/provider";
import { getCurrentUser } from "@/lib/auth/dal";
import { explainBack } from "@/lib/learning/explain";
import { explainBackRequestSchema } from "@/lib/learning/schemas";
import { allowLearningCall } from "@/lib/learning/usage";
import { readCourse } from "@/lib/sage/data";
import { createClient } from "@/lib/supabase/server";
import { busyMessage, fail } from "../respond";

export const maxDuration = 60;

/** POST /api/learning/explain-back — the student explains an idea in their own words; short feedback on gaps. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in again.");
  if (user.role !== "student") return fail(403, "Explain it back is for students.");
  const parsed = explainBackRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "That didn't come through.");
  if (!aiStatus().chat) return fail(503, "Sage isn't switched on yet — please check back soon.");

  const db = await createClient();
  const [course, conversation] = await Promise.all([
    readCourse(db, parsed.data.courseId),
    parsed.data.conversationId
      ? db.from("conversations").select("id").eq("id", parsed.data.conversationId).eq("student_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!course) return fail(404, "We couldn't find this course in your list.");
  if (!(await allowLearningCall(user.id, "explain_back"))) return fail(429, busyMessage);

  try {
    const result = await explainBack({
      studentId: user.id,
      course,
      conversationId: conversation.data?.id ?? null,
      topic: parsed.data.topic,
      explanation: parsed.data.explanation,
    });
    if (!result.ok) return fail(result.status, result.message);
    return NextResponse.json(result);
  } catch (error) {
    console.error("explain back:", error);
    return fail(500, "Sage couldn't read your explanation just now. Please try again in a moment.");
  }
}
