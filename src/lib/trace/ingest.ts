import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { clampEventTime } from "./time";
import type { TraceBatch } from "./schemas";

export type BatchResult =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 500; message: string };

/**
 * Stores one editor batch as the signed-in student: events, the latest
 * document and a replay snapshot. Row-level security limits all of it to the
 * student's own draft; a submitted piece of work is read-only.
 */
export async function saveBatch(
  supabase: SupabaseClient<Database>,
  submissionId: string,
  batch: TraceBatch,
): Promise<BatchResult> {
  const { data: submission, error } = await supabase
    .from("submissions")
    .select("id, submitted_at")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: "We couldn't save just now." };
  if (!submission) return { ok: false, status: 404, message: "This piece of work wasn't found." };
  if (submission.submitted_at) {
    return { ok: false, status: 409, message: "This work is already submitted." };
  }

  const now = Date.now();
  const times = batch.events.map((e) => clampEventTime(e.at, now));
  if (batch.events.length > 0) {
    const { error: eventsError } = await supabase.from("writing_events").insert(
      batch.events.map((e, i) => ({
        submission_id: submissionId,
        type: e.type,
        size: e.size,
        at: new Date(times[i]).toISOString(),
      })),
    );
    if (eventsError) return { ok: false, status: 500, message: "We couldn't save just now." };
  }

  if (batch.content !== undefined) {
    // The document can't have changed after the batch's last event, so the
    // snapshot is dated then; the replay shows each edit as it lands.
    const at = new Date(times.length ? Math.max(...times) : now).toISOString();
    const updatedAt = new Date(now).toISOString();
    const [update, snapshot] = await Promise.all([
      supabase
        .from("submissions")
        .update({ content: batch.content, updated_at: updatedAt })
        .eq("id", submissionId),
      supabase.from("writing_snapshots").insert({
        submission_id: submissionId,
        content: batch.content,
        char_count: batch.charCount ?? 0,
        at,
      }),
    ]);
    if (update.error || snapshot.error) {
      return { ok: false, status: 500, message: "We couldn't save just now." };
    }
  }

  return { ok: true };
}
