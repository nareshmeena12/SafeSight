import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateIntegrityReport } from "@/lib/trace/report";
import { authorize, jsonError } from "../../request";

export const maxDuration = 60;

/** Lets the course teacher (re)run the Trace agent for a submitted piece of work. */
export async function POST(_request: Request, ctx: RouteContext<"/api/trace/[submissionId]/report">) {
  const auth = await authorize(ctx.params, ["teacher"]);
  if (auth instanceof NextResponse) return auth;

  // Row-level security: the teacher only sees submissions in their own courses.
  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("submissions")
    .select("id, submitted_at")
    .eq("id", auth.submissionId)
    .maybeSingle();
  if (!submission) return jsonError(404, "This piece of work wasn't found.");
  if (!submission.submitted_at) return jsonError(409, "This work hasn't been submitted yet.");

  try {
    const report = await generateIntegrityReport(auth.submissionId);
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    console.error("Trace report failed", e);
    return jsonError(500, "We couldn't prepare the summary just now. Please try again.");
  }
}
