import { NextResponse } from "next/server";
import { aiStatus } from "@/lib/ai/provider";
import { getCurrentUser } from "@/lib/auth/dal";
import { recapConversation } from "@/lib/learning/recap";
import { recapRequestSchema } from "@/lib/learning/schemas";
import { allowLearningCall } from "@/lib/learning/usage";
import { createClient } from "@/lib/supabase/server";
import { fail } from "../respond";

export const maxDuration = 60;

/**
 * POST /api/learning/recap — "What you learned" and flashcards for a Sage
 * chat that ended (New chat, leaving the page) or went idle. Also sent with
 * navigator.sendBeacon, so it does the work before answering.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "student") return fail(401, "Please sign in again.");
  const parsed = recapRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "That didn't come through.");
  if (!aiStatus().chat) return NextResponse.json({ recap: null, reason: "unavailable" });

  // Row-level security: the student's own chat only.
  const { data: chat } = await (await createClient())
    .from("conversations")
    .select("id, course_id, courses(id, name, code), assignments(title, ai_mode)")
    .eq("id", parsed.data.conversationId)
    .eq("student_id", user.id)
    .maybeSingle();
  if (!chat?.courses) return fail(404, "We couldn't find this chat.");
  if (!(await allowLearningCall(user.id, "recap"))) return NextResponse.json({ recap: null, reason: "busy" });

  try {
    const result = await recapConversation({
      studentId: user.id,
      conversation: {
        id: chat.id,
        course: chat.courses,
        assignment: chat.assignments ? { title: chat.assignments.title, mode: chat.assignments.ai_mode } : null,
      },
    });
    return NextResponse.json(result.ok ? { recap: result.recap } : { recap: null, reason: result.reason });
  } catch (error) {
    console.error("recap:", error);
    return NextResponse.json({ recap: null, reason: "unavailable" });
  }
}
