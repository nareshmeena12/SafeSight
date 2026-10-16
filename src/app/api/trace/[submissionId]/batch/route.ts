import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveBatch } from "@/lib/trace/ingest";
import { authorize, jsonError, readBatch } from "../../request";

/** The Trace editor's autosave: events, document and snapshot, every ~5s. */
export async function POST(request: Request, ctx: RouteContext<"/api/trace/[submissionId]/batch">) {
  const auth = await authorize(ctx.params, ["student"]);
  if (auth instanceof NextResponse) return auth;
  const batch = await readBatch(request);
  if (batch instanceof NextResponse) return batch;

  const result = await saveBatch(await createClient(), auth.submissionId, batch);
  if (!result.ok) return jsonError(result.status, result.message);
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
