import { z } from "zod";
import { aiStatus } from "@/lib/ai/provider";
import { allowAiCall } from "@/lib/ai/usage-log";
import { getCurrentUser } from "@/lib/auth/dal";
import { readSyllabus, syllabusPdfText, teacherCourse } from "@/lib/setup/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const bodySchema = z.union([
  z.object({
    courseId: z.uuid(),
    text: z.string().trim().min(1, "Paste the syllabus first.").max(100_000, "That's very long. Paste just the syllabus part."),
  }),
  z.object({
    courseId: z.uuid(),
    /** Storage path the browser uploaded to: <courseId>/<uuid>.pdf */
    path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i, "Upload the PDF first."),
    fileName: z.string().trim().max(200).default(""),
  }),
]);

function problem(status: number, error: string) {
  return Response.json({ error }, { status });
}

/**
 * POST /api/setup/syllabus — the course teacher sends a syllabus (pasted text,
 * or a PDF they uploaded to the course's folder); the model reads its units,
 * topics and course outcomes into a draft topic map for them to review.
 * 10 an hour per teacher.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return problem(401, "Please log in again.");
  if (user.role === "student") return problem(403, "Only teachers can set up a course.");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Something was missing.");
  const body = parsed.data;
  const course = await teacherCourse(await createClient(), user.id, body.courseId);
  if (!course) return problem(403, "Only this course's teacher can add its syllabus.");
  if (!aiStatus().chat) {
    return problem(503, "SafeSight's AI model isn't set up yet, so it can't read the syllabus. You can type the topics in by hand.");
  }
  if (!(await allowAiCall(user.id, "syllabus_extract", { limit: 10, windowMs: 60 * 60_000 }))) {
    return problem(429, "You've read a lot of syllabi this hour. Please try again in a little while.");
  }

  let text: string;
  let source: "pdf" | "text" = "text";
  let path: string | null = null;
  let fileName = "";
  if ("path" in body) {
    if (!body.path.startsWith(`${course.id}/`)) return problem(400, "Upload the PDF first.");
    const pdf = await syllabusPdfText(body.path);
    if ("error" in pdf) return problem(422, pdf.error);
    ({ text } = pdf);
    source = "pdf";
    path = body.path;
    fileName = body.fileName;
  } else text = body.text;

  try {
    const result = await readSyllabus({ course, userId: user.id, source, text, path, fileName });
    if (!result.ok) return problem(422, result.error);
    return Response.json({ draft: result.draft });
  } catch (e) {
    console.error("read syllabus:", e);
    return problem(502, "We couldn't read the syllabus just now. Please try again in a minute.");
  }
}
