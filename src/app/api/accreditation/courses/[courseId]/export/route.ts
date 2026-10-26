import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { accreditationCourse, courseReport } from "@/lib/accreditation/data";
import { reportResponse } from "@/lib/accreditation/export";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const querySchema = z.object({ courseId: z.uuid(), format: z.enum(["pdf", "xlsx"]) });

/** GET /api/accreditation/courses/[courseId]/export?format=pdf|xlsx — the course's CO / PO attainment report (course teacher only). */
export async function GET(request: Request, ctx: RouteContext<"/api/accreditation/courses/[courseId]/export">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please log in again." }, { status: 401 });
  if (user.role === "student") return Response.json({ error: "Only teachers can export reports." }, { status: 403 });
  const parsed = querySchema.safeParse({
    courseId: (await ctx.params).courseId,
    format: new URL(request.url).searchParams.get("format") ?? "pdf",
  });
  if (!parsed.success) return Response.json({ error: "Not found." }, { status: 404 });
  const db = await createClient();
  const course = await accreditationCourse(db, user.id, parsed.data.courseId);
  if (!course) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const { doc } = await courseReport(db, course);
    return await reportResponse(doc, parsed.data.format);
  } catch (e) {
    console.error("course report export:", e);
    return Response.json({ error: "We couldn't prepare the report just now. Please try again." }, { status: 500 });
  }
}
