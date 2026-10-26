import { aiStatus } from "@/lib/ai/provider";
import { allowAiCall } from "@/lib/ai/usage-log";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { checkResilience } from "@/lib/teacher/resilience";
import { resilienceRequestSchema } from "@/lib/teacher/resilience-schema";

export const maxDuration = 60;

function problem(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * POST "Check AI resilience" for an assignment's title and instructions (the
 * form's current text, so it works before the assignment is saved). Course
 * teacher only; 30 checks an hour per teacher, counted from ai_usage.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return problem(401, "Please log in again.");
  if (user.role !== "teacher") return problem(403, "Only the course teacher can check assignments.");

  const body = await request.json().catch(() => null);
  const parsed = resilienceRequestSchema.safeParse(body);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "That didn't come through. Please try again.");

  // RLS and the owner filter: only the teacher's own course.
  const { data: course } = await (await createClient())
    .from("courses")
    .select("name, code")
    .eq("id", parsed.data.courseId)
    .eq("teacher_id", user.id)
    .maybeSingle();
  if (!course) return problem(404, "This course wasn't found in your courses.");

  if (!aiStatus().chat) return problem(503, "The AI check isn't set up yet. Once the model settings are added, it works here.");
  if (!(await allowAiCall(user.id, "ai_resilience", { limit: 30, windowMs: 60 * 60_000 }))) {
    return problem(429, "You've checked a lot of assignments this hour. Please try again in a little while.");
  }

  try {
    const result = await checkResilience(parsed.data, course, user.id);
    if (!result) return problem(502, "The check didn't come back in a usable form. Please try again.");
    return Response.json(result);
  } catch (e) {
    console.error("AI resilience check failed", e);
    return problem(502, "We couldn't check this just now. Please try again in a moment.");
  }
}
