import { z } from "zod";
import { aiStatus } from "@/lib/ai/provider";
import { allowAiCall } from "@/lib/ai/usage-log";
import { getCurrentUser } from "@/lib/auth/dal";
import { suggestAssignments, teacherCourse } from "@/lib/setup/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const bodySchema = z.object({ courseId: z.uuid() });

function problem(status: number, error: string) {
  return Response.json({ error }, { status });
}

/**
 * POST /api/setup/suggestions — suggests assignments per unit of the saved
 * topic map, each with a recommended AI mode. Nothing is created: the teacher
 * opens a suggestion in the assignment form. 10 an hour per teacher.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return problem(401, "Please log in again.");
  if (user.role === "student") return problem(403, "Only teachers can set up a course.");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, "That didn't come through. Please reload the page.");

  const db = await createClient();
  const course = await teacherCourse(db, user.id, parsed.data.courseId);
  if (!course) return problem(403, "Only this course's teacher can do this.");
  if (!aiStatus().chat) return problem(503, "SafeSight's AI model isn't set up yet, so it can't suggest assignments.");
  if (!(await allowAiCall(user.id, "assignment_suggest", { limit: 10, windowMs: 60 * 60_000 }))) {
    return problem(429, "You've asked for a lot of suggestions this hour. Please try again in a little while.");
  }

  try {
    const suggestions = await suggestAssignments(db, course, user.id);
    if (suggestions === null) return problem(502, "We couldn't come up with suggestions just now. Please try again.");
    if (!suggestions.length) return problem(409, "Save a topic map first, then ask for suggestions.");
    return Response.json({ suggestions });
  } catch (e) {
    console.error("suggest assignments:", e);
    return problem(502, "We couldn't come up with suggestions just now. Please try again.");
  }
}
