import { aiStatus } from "@/lib/ai/provider";
import { allowAiCall } from "@/lib/ai/usage-log";
import { getCurrentUser } from "@/lib/auth/dal";
import { accreditationCourse, readCourseAccreditation } from "@/lib/accreditation/data";
import { cleanSuggestions, SUGGEST_SYSTEM_PROMPT, suggestionOutputSchema, suggestPrompt } from "@/lib/accreditation/suggest";
import { generateJson } from "@/lib/learning/ai";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const maxDuration = 60;

const paramsSchema = z.object({ courseId: z.uuid() });

function problem(status: number, error: string) {
  return Response.json({ error }, { status });
}

/**
 * POST /api/accreditation/courses/[courseId]/suggest — suggests CO–PO levels
 * with a reason each, from the CO and PO statements. Nothing is saved: the
 * teacher reviews the grid and saves it. 10 an hour per teacher.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/accreditation/courses/[courseId]/suggest">) {
  const user = await getCurrentUser();
  if (!user) return problem(401, "Please log in again.");
  if (user.role === "student") return problem(403, "Only teachers can map outcomes.");
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) return problem(404, "Not found.");
  const db = await createClient();
  const course = await accreditationCourse(db, user.id, parsed.data.courseId);
  if (!course) return problem(403, "Only this course's teacher can do this.");
  const data = await readCourseAccreditation(db, course);
  if (!data.outcomes.length) return problem(409, "Add the course outcomes first.");
  if (!data.programOutcomes.length) return problem(409, "Link the course to a programme with POs first.");
  if (!aiStatus().chat) return problem(503, "SafeSight's AI model isn't set up yet, so it can't suggest a mapping. You can fill the grid yourself.");
  if (!(await allowAiCall(user.id, "co_po_suggest", { limit: 10, windowMs: 60 * 60_000 }))) {
    return problem(429, "You've asked for a lot of suggestions this hour. Please try again in a little while.");
  }

  const raw = await generateJson({
    feature: "co_po_suggest",
    userId: user.id,
    system: SUGGEST_SYSTEM_PROMPT,
    prompt: suggestPrompt(course, data.outcomes, data.programOutcomes),
    schema: suggestionOutputSchema,
    name: "co_po_mapping",
    timeoutMs: 45_000,
    maxOutputTokens: 4000,
    temperature: 0.2,
  });
  if (!raw) return problem(502, "We couldn't suggest a mapping just now. Please try again.");
  const cells = cleanSuggestions(raw, data.outcomes, data.programOutcomes);
  if (!cells.length) return problem(502, "The suggestion didn't match your outcomes. Please try again.");
  return Response.json({ cells });
}
