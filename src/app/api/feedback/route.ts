import { aiStatus } from "@/lib/ai/provider";
import { allowAiCall } from "@/lib/ai/usage-log";
import { getCurrentUser } from "@/lib/auth/dal";
import { draftFeedback, saveFeedback } from "@/lib/feedback/feedback";
import { draftFeedbackSchema, saveFeedbackSchema } from "@/lib/feedback/rubric";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 90;

function problem(status: number, message: string, extra?: object) {
  return Response.json({ error: message, ...extra }, { status });
}

async function courseTeacher() {
  const user = await getCurrentUser();
  if (!user) return problem(401, "Please log in again.");
  if (user.role !== "teacher") return problem(403, "Only the course teacher can do this.");
  return user;
}

/** POST: Lens drafts feedback per rubric criterion (course teacher; 30 an hour). Saved as a draft only. */
export async function POST(request: Request) {
  const user = await courseTeacher();
  if (user instanceof Response) return user;
  const parsed = draftFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, "That didn't come through. Please reload the page.");
  if (!aiStatus().chat) return problem(503, "Lens isn't connected to its AI model yet, so it can't draft feedback.");
  if (!(await allowAiCall(user.id, "feedback_draft", { limit: 30, windowMs: 60 * 60_000 }))) {
    return problem(429, "You've drafted a lot of feedback this hour. Please try again in a little while.");
  }
  try {
    const result = await draftFeedback(await createClient(), parsed.data.submissionId, user.id);
    if (!result) return problem(404, "This piece of work wasn't found, or isn't submitted yet.");
    if (result.status === "approved") return problem(409, "This feedback is already shared. Take it back to a draft first.");
    if (!result.feedback) return problem(502, "Lens didn't come back with usable feedback. Please try again.");
    return Response.json({ feedback: result.feedback });
  } catch (e) {
    console.error("Feedback draft failed", e);
    return problem(502, "Lens couldn't draft feedback just now. Please try again in a moment.");
  }
}

/** PUT: save the teacher's edits; status "approved" shares it with the student, "draft" keeps it private. */
export async function PUT(request: Request) {
  const user = await courseTeacher();
  if (user instanceof Response) return user;
  const parsed = saveFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return problem(400, issue?.message ?? "Please check the feedback and try again.");
  }
  try {
    const feedback = await saveFeedback(await createClient(), parsed.data, user.id);
    if (!feedback) return problem(404, "This piece of work wasn't found, or isn't submitted yet.");
    return Response.json({ feedback });
  } catch (e) {
    console.error("Feedback save failed", e);
    return problem(500, "That didn't save. Please try again.");
  }
}
