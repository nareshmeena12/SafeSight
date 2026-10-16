import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { careData } from "./care";
import { MATCH_THRESHOLD } from "./match";
import { citationsSchema, type SageUIMessage } from "./types";

/**
 * A saved Sage chat as UI messages, read with the student's own client
 * (row-level security: only their own messages).
 */
export async function loadChatMessages(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  {
    homeAssignmentId = null,
    assignments = new Map(),
  }: {
    homeAssignmentId?: string | null;
    /** Titles and modes, to say which assignment's rule applied to an Explore reply. */
    assignments?: Map<string, { title: string; mode: "learn" | "assist" | "exam" }>;
  } = {},
): Promise<SageUIMessage[]> {
  const { data: rows } = await supabase
    .from("messages")
    .select("id, role, content, intent, hint_level, citations, matched_assignment_id, match_score")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  const care = careData();
  return (rows ?? []).map((m, i, all) => {
    const prev = all[i - 1];
    const asked = m.role === "assistant" && prev?.role === "user" ? prev : null;
    const afterDistress = asked?.intent === "distress";
    const citations = citationsSchema.safeParse(m.citations);
    const matched =
      asked?.matched_assignment_id && asked.matched_assignment_id !== homeAssignmentId && (asked.match_score ?? 0) >= MATCH_THRESHOLD
        ? assignments.get(asked.matched_assignment_id) ?? null
        : null;
    return {
      id: m.id,
      role: m.role,
      parts: [
        ...(afterDistress ? [{ type: "data-care" as const, id: "care", data: care }] : []),
        { type: "text" as const, text: m.content },
      ],
      metadata: {
        hintLevel: m.hint_level,
        citations: citations.success ? citations.data : [],
        rules: matched,
      },
    };
  });
}
