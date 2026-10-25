import "server-only";
import { activeAssignments } from "@/lib/sage/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "./ai";
import { checkRecapText } from "./checks";
import { recapPrompt, recapSystem } from "./prompts";
import { recapJsonShape, recapOutputSchema } from "./schemas";

/**
 * Session recap: when a Sage chat ends (New chat, leaving the page) or goes
 * idle, "What you learned" (3–5 bullets) and 3 flashcards for the stretch of
 * the chat since the last recap, saved to My learning. Recaps only restate
 * what the chat covered: no new numbers, nothing from an answer key.
 */

export type Recap = {
  id: string;
  title: string;
  learned: string[];
  flashcards: { front: string; back: string }[];
  createdAt: string;
};

/** Enough of a chat to be worth a recap. */
export const MIN_STUDENT_MESSAGES = 2;
const TRANSCRIPT_CHARS = 12_000;

/** Conversations this server instance is recapping right now. */
const inFlight = new Set<string>();

export async function recapConversation({
  studentId,
  conversation,
}: {
  studentId: string;
  /** Read under the student's row-level security by the caller. */
  conversation: {
    id: string;
    course: { id: string; name: string; code: string };
    assignment: { title: string; mode: "learn" | "assist" | "exam" } | null;
  };
}): Promise<{ ok: true; recap: Recap } | { ok: false; reason: "exam" | "too_short" | "busy" | "unavailable" }> {
  if (conversation.assignment?.mode === "exam") return { ok: false, reason: "exam" };
  if (inFlight.has(conversation.id)) return { ok: false, reason: "busy" };
  inFlight.add(conversation.id);
  try {
    const admin = createAdminClient();
    const { data: last } = await admin
      .from("sage_recaps")
      .select("to_at")
      .eq("conversation_id", conversation.id)
      .order("to_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let query = admin
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(120);
    if (last) query = query.gt("created_at", last.to_at);
    const { data: rows, error } = await query;
    if (error) throw new Error(`recap messages: ${error.message}`);
    const messages = rows ?? [];
    if (messages.filter((m) => m.role === "user").length < MIN_STUDENT_MESSAGES || !messages.some((m) => m.role === "assistant")) {
      return { ok: false, reason: "too_short" };
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "Student" : "Sage"}: ${m.content}`)
      .join("\n\n")
      .slice(-TRANSCRIPT_CHARS);
    const keys = (await activeAssignments(conversation.course.id)).map((a) => a.answerKey).filter((k) => k.trim());
    const course = conversation.course.code ? `${conversation.course.code} ${conversation.course.name}` : conversation.course.name;

    for (let round = 0; round < 2; round++) {
      const out = await generateJson({
        feature: "recap",
        userId: studentId,
        system: recapSystem(recapJsonShape),
        prompt: recapPrompt({ course, assignment: conversation.assignment?.title ?? null, transcript }),
        schema: recapOutputSchema,
        name: "recap",
        maxOutputTokens: 3500,
        temperature: round ? 0.1 : 0.3,
      });
      if (!out) return { ok: false, reason: "unavailable" };
      const learned = out.learned.map((l) => l.trim()).filter((l) => checkRecapText(l, transcript, keys).ok).slice(0, 5);
      const flashcards = out.flashcards
        .map((c) => ({ front: c.front.trim(), back: c.back.trim() }))
        .filter((c) => checkRecapText(`${c.front}\n${c.back}`, transcript, keys).ok)
        .slice(0, 3);
      if (learned.length < 2 || !flashcards.length || !checkRecapText(out.title, transcript, keys).ok) continue;

      const { data: saved, error: insertError } = await admin
        .from("sage_recaps")
        .insert({
          student_id: studentId,
          course_id: conversation.course.id,
          conversation_id: conversation.id,
          title: out.title.trim().slice(0, 120),
          learned,
          flashcards,
          from_at: messages[0].created_at,
          to_at: messages.at(-1)!.created_at,
          messages: messages.length,
        })
        .select("id, created_at")
        .single();
      if (insertError || !saved) throw new Error(`recap: ${insertError?.message}`);
      return { ok: true, recap: { id: saved.id, title: out.title.trim(), learned, flashcards, createdAt: saved.created_at } };
    }
    return { ok: false, reason: "unavailable" };
  } finally {
    inFlight.delete(conversation.id);
  }
}
