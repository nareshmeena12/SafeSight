import "server-only";
import type { LanguageModelUsage } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ai_usage: tokens per AI call, with institution, user and feature. Also the
 * per-user rate limit for the learning tools (calls per feature per hour),
 * so the limit holds across server instances.
 */

export type AiFeature =
  | "sage_classify"
  | "sage_reply"
  | "sage_guard"
  | "sage_mistake"
  | "practice_generate"
  | "practice_grade"
  | "refresher_generate"
  | "explain_back"
  | "recap";

const institutions = new Map<string, { id: string | null; at: number }>();

async function institutionOf(userId: string): Promise<string | null> {
  const cached = institutions.get(userId);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.id;
  const { data } = await createAdminClient().from("profiles").select("institution_id").eq("id", userId).maybeSingle();
  const id = data?.institution_id ?? null;
  institutions.set(userId, { id, at: Date.now() });
  return id;
}

/** Best effort: a failed log never fails the feature. */
export async function logAiUsage(
  userId: string | null,
  feature: AiFeature,
  usage: Partial<Pick<LanguageModelUsage, "inputTokens" | "outputTokens" | "totalTokens">> | undefined,
  model = process.env.AI_MODEL ?? null,
) {
  try {
    const input = usage?.inputTokens ?? 0;
    const output = usage?.outputTokens ?? 0;
    const { error } = await createAdminClient()
      .from("ai_usage")
      .insert({
        user_id: userId,
        institution_id: userId ? await institutionOf(userId) : null,
        feature,
        model,
        input_tokens: input,
        output_tokens: output,
        total_tokens: usage?.totalTokens ?? input + output,
      });
    if (error) console.warn("ai_usage:", error.message);
  } catch (error) {
    console.warn("ai_usage:", error instanceof Error ? error.message : error);
  }
}

/** Calls per hour per student for each learning tool. */
export const LEARNING_LIMITS: Partial<Record<AiFeature, number>> = {
  practice_generate: 12,
  refresher_generate: 10,
  practice_grade: 60,
  explain_back: 20,
  recap: 30,
};

const WINDOW_MS = 60 * 60 * 1000;

/** Whether the student may make another call to this feature now. */
export async function allowLearningCall(userId: string, feature: AiFeature, now = Date.now()) {
  const limit = LEARNING_LIMITS[feature];
  if (!limit) return true;
  const { count, error } = await createAdminClient()
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", new Date(now - WINDOW_MS).toISOString());
  if (error) {
    console.warn("ai_usage limit:", error.message);
    return true;
  }
  return (count ?? 0) < limit;
}
