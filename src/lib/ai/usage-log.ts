import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UsageRecord } from "./usage";

/** Keeps a background write alive after the response inside a request; outside one (scripts) it just runs. */
function keepAlive(promise: Promise<unknown>) {
  try {
    after(() => promise);
  } catch {
    // Not in a request scope (evals, scripts).
  }
}

/** One row in ai_usage per model call. Never throws; the institution comes from the user's profile (trigger). */
export function recordUsage(r: UsageRecord) {
  const write = (async () => {
    try {
      const { error } = await createAdminClient().from("ai_usage").insert({
        feature: r.feature,
        user_id: r.userId,
        model: r.model.slice(0, 200),
        input_tokens: r.inputTokens,
        output_tokens: r.outputTokens,
        ok: r.ok,
      });
      if (error) console.warn("ai_usage:", error.message);
    } catch (error) {
      console.warn("ai_usage:", error instanceof Error ? error.message : error);
    }
  })();
  keepAlive(write);
}

/**
 * Per-user limit for AI features without their own counter: the number of
 * calls this user made to `feature` within the window, from ai_usage.
 * Fails open (allowed) if the table can't be read, so a logging problem never
 * locks a teacher out.
 */
export async function allowAiCall(userId: string, feature: string, { limit, windowMs }: { limit: number; windowMs: number }) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await createAdminClient()
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", since);
  if (error) {
    console.warn("ai_usage limit:", error.message);
    return true;
  }
  return (count ?? 0) < limit;
}
