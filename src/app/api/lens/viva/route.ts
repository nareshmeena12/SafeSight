import { aiStatus } from "@/lib/ai/provider";
import { allowAiCall } from "@/lib/ai/usage-log";
import { getCurrentUser } from "@/lib/auth/dal";
import { markVivaQuestion, suggestVivaQuestions } from "@/lib/lens/viva";
import { vivaMarkSchema, vivaRequestSchema } from "@/lib/lens/viva-schema";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

function problem(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

async function courseTeacher() {
  const user = await getCurrentUser();
  if (!user) return problem(401, "Please log in again.");
  if (user.role !== "teacher") return problem(403, "Only the course teacher can do this.");
  return user;
}

/** POST: Lens suggests three viva questions for a submission (course teacher; 20 an hour). */
export async function POST(request: Request) {
  const user = await courseTeacher();
  if (user instanceof Response) return user;
  const parsed = vivaRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, "That didn't come through. Please reload the page.");

  if (!aiStatus().chat) return problem(503, "Lens isn't connected to its AI model yet, so it can't suggest questions.");
  if (!(await allowAiCall(user.id, "lens_viva", { limit: 20, windowMs: 60 * 60_000 }))) {
    return problem(429, "You've asked for a lot of questions this hour. Please try again in a little while.");
  }

  try {
    const result = await suggestVivaQuestions(await createClient(), parsed.data.submissionId, user.id);
    if (!result) return problem(404, "This piece of work wasn't found, or isn't submitted yet.");
    if (!result.questions) return problem(502, "Lens didn't come back with usable questions. Please try again.");
    return Response.json({ questions: result.questions });
  } catch (e) {
    console.error("Viva questions failed", e);
    return problem(502, "Lens couldn't suggest questions just now. Please try again in a moment.");
  }
}

/** PATCH: mark one question discussed, or not. */
export async function PATCH(request: Request) {
  const user = await courseTeacher();
  if (user instanceof Response) return user;
  const parsed = vivaMarkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, "That didn't come through. Please reload the page.");
  const { submissionId, index, discussed } = parsed.data;
  try {
    const questions = await markVivaQuestion(await createClient(), submissionId, index, discussed);
    if (!questions) return problem(404, "These questions weren't found.");
    return Response.json({ questions });
  } catch (e) {
    console.error("Viva mark failed", e);
    return problem(500, "That didn't save. Please try again.");
  }
}
