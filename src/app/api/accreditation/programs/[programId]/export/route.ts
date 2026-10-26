import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { programAttainmentData, programReport, readProgram } from "@/lib/accreditation/data";
import { reportResponse } from "@/lib/accreditation/export";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const querySchema = z.object({ programId: z.uuid(), format: z.enum(["pdf", "xlsx"]) });

/**
 * GET /api/accreditation/programs/[programId]/export?format=pdf|xlsx — the
 * programme's PO attainment across its courses. Anyone who can read the
 * programme under RLS (its institution's teachers); aggregates only.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/accreditation/programs/[programId]/export">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please log in again." }, { status: 401 });
  if (user.role === "student") return Response.json({ error: "Only teachers can export reports." }, { status: 403 });
  const parsed = querySchema.safeParse({
    programId: (await ctx.params).programId,
    format: new URL(request.url).searchParams.get("format") ?? "pdf",
  });
  if (!parsed.success) return Response.json({ error: "Not found." }, { status: 404 });
  const read = await readProgram(await createClient(), parsed.data.programId);
  if (!read) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const rows = await programAttainmentData(read.program.id, user.id);
    const { doc } = await programReport(read.program, read.outcomes, rows);
    return await reportResponse(doc, parsed.data.format);
  } catch (e) {
    console.error("programme report export:", e);
    return Response.json({ error: "We couldn't prepare the report just now. Please try again." }, { status: 500 });
  }
}
