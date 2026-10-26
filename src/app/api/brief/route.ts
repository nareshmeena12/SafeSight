import { z } from "zod";
import { aiStatus } from "@/lib/ai/provider";
import { allowAiCall } from "@/lib/ai/usage-log";
import { getCurrentUser } from "@/lib/auth/dal";
import { generateBrief } from "@/lib/brief/brief";
import { createClient } from "@/lib/supabase/server";
import { courseScope } from "@/lib/teacher/queries";

// Two structured calls (misconceptions, then the quiz), each with one more attempt.
export const maxDuration = 120;

const bodySchema = z.object({ courseId: z.uuid() });

function problem(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/** POST: prepare (or refresh) this week's pre-lecture brief for one course. Course teacher; 10 an hour. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return problem(401, "Please log in again.");
  if (user.role !== "teacher") return problem(403, "Only the course teacher can do this.");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, "That didn't come through. Please reload the page.");

  const db = await createClient();
  const scope = await courseScope(db, user.id, parsed.data.courseId);
  if (!scope || scope.length !== 1) return problem(404, "This course wasn't found.");
  if (!aiStatus().chat) return problem(503, "Lens isn't connected to its AI model yet, so it can't prepare a brief.");
  // Each brief is two calls (plus retries), so this allows about 5 briefs an hour.
  if (!(await allowAiCall(user.id, "lecture_brief", { limit: 10, windowMs: 60 * 60_000 }))) {
    return problem(429, "You've prepared a lot of briefs this hour. Please try again in a little while.");
  }

  try {
    const result = await generateBrief({ courseId: parsed.data.courseId, teacherId: user.id, source: "teacher", signal: request.signal });
    if (result.status === "failed") return problem(502, "Lens didn't come back with a usable brief. Please try again.");
    return Response.json({ brief: result.brief });
  } catch (e) {
    console.error("Brief failed", e);
    return problem(502, "Lens couldn't prepare the brief just now. Please try again in a moment.");
  }
}
