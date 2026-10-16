import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveBatch } from "@/lib/trace/ingest";
import { generateIntegrityReport } from "@/lib/trace/report";
import { authorize, jsonError, readBatch } from "../../request";

export const maxDuration = 60;

/**
 * Saves the last batch, marks the work submitted, then lets the Trace agent
 * write the evidence summary after the response is sent.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/trace/[submissionId]/submit">) {
  const auth = await authorize(ctx.params, ["student"]);
  if (auth instanceof NextResponse) return auth;
  const batch = await readBatch(request);
  if (batch instanceof NextResponse) return batch;

  const supabase = await createClient();
  const saved = await saveBatch(supabase, auth.submissionId, batch);
  if (!saved.ok) return jsonError(saved.status, saved.message);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("submissions")
    .update({ submitted_at: now, updated_at: now })
    .eq("id", auth.submissionId)
    .is("submitted_at", null)
    .select("id");
  if (error || !data?.length) return jsonError(500, "We couldn't submit just now. Please try again.");

  after(async () => {
    try {
      await generateIntegrityReport(auth.submissionId);
    } catch (e) {
      console.error("Trace report failed", e);
    }
  });

  return NextResponse.json({ ok: true, submittedAt: now });
}
