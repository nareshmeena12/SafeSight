import "server-only";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { careData } from "./care";
import type { LadderState } from "./policy";
import { citationsSchema, type SageUIMessage } from "./types";

/**
 * "Preview Sage": a teacher chatting with Sage on their own course or
 * assignment, as a student would. Stored in sage_preview_chats only — never
 * in conversations/messages — so a preview can't reach labels, flags, the
 * Reliance Score or any dashboard number. One chat per teacher per target.
 */

/** Kept per preview chat; older turns drop off. */
const MAX_MESSAGES = 80;
const HISTORY_LIMIT = 40;
export const PREVIEW_RATE_PER_HOUR = 60;

const previewMessageSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable().default(null),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  at: z.string(),
  hintLevel: z.number().int().nullable().default(null),
  intent: z.string().nullable().default(null),
  citations: citationsSchema.default([]),
  rules: z.object({ title: z.string(), mode: z.enum(["learn", "assist", "exam"]) }).nullable().default(null),
});
export type PreviewMessage = z.infer<typeof previewMessageSchema>;

const ladderSchema = z.record(
  z.string(),
  z.object({ step: z.number().int(), attempts: z.number().int(), lastExampleAt: z.string().nullable() }),
);

export type PreviewChat = { id: string | null; messages: PreviewMessage[]; ladder: Record<string, LadderState> };

export type PreviewTarget = { teacherId: string; courseId: string; assignmentId: string | null };

function parse(row: { id: string; messages: Json; ladder: Json } | null): PreviewChat {
  if (!row) return { id: null, messages: [], ladder: {} };
  const messages = z.array(z.unknown()).catch([]).parse(row.messages).flatMap((m) => {
    const parsed = previewMessageSchema.safeParse(m);
    return parsed.success ? [parsed.data] : [];
  });
  return { id: row.id, messages, ladder: ladderSchema.catch({}).parse(row.ladder) };
}

export async function readPreview({ teacherId, courseId, assignmentId }: PreviewTarget): Promise<PreviewChat> {
  let query = createAdminClient()
    .from("sage_preview_chats")
    .select("id, messages, ladder")
    .eq("teacher_id", teacherId)
    .eq("course_id", courseId);
  query = assignmentId ? query.eq("assignment_id", assignmentId) : query.is("assignment_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`preview: ${error.message}`);
  return parse(data);
}

/** Writes the whole chat back (one row per teacher per target). */
export async function savePreview(target: PreviewTarget, chat: PreviewChat) {
  const admin = createAdminClient();
  const values = {
    messages: chat.messages.slice(-MAX_MESSAGES) as unknown as Json,
    ladder: chat.ladder as unknown as Json,
    updated_at: new Date().toISOString(),
  };
  if (chat.id) {
    const { error } = await admin.from("sage_preview_chats").update(values).eq("id", chat.id);
    if (error) throw new Error(`save preview: ${error.message}`);
    return;
  }
  const { error } = await admin.from("sage_preview_chats").insert({
    teacher_id: target.teacherId,
    course_id: target.courseId,
    assignment_id: target.assignmentId,
    ...values,
  });
  // A parallel first message created the row: write over it.
  if (error?.code === "23505") {
    const existing = await readPreview(target);
    if (existing.id) return savePreview(target, { ...chat, id: existing.id });
  }
  if (error) throw new Error(`save preview: ${error.message}`);
}

/** User messages this teacher sent in any preview within the last hour. */
export async function previewMessagesLastHour(teacherId: string, now = Date.now()) {
  const { data, error } = await createAdminClient()
    .from("sage_preview_chats")
    .select("id, messages, ladder")
    .eq("teacher_id", teacherId)
    .gte("updated_at", new Date(now - 60 * 60_000).toISOString());
  if (error) throw new Error(`preview rate: ${error.message}`);
  const since = now - 60 * 60_000;
  return (data ?? [])
    .flatMap((row) => parse(row).messages)
    .filter((m) => m.role === "user" && Date.parse(m.at) >= since).length;
}

/** The chat so far for the model, plus the "student's" own earlier text. */
export function previewHistory(chat: PreviewChat): { history: ModelMessage[]; earlierStudentText: string } {
  const rows = chat.messages.slice(-HISTORY_LIMIT);
  return {
    history: rows.map((m) => ({ role: m.role, content: m.content }) as ModelMessage),
    earlierStudentText: rows
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n"),
  };
}

/** Sage's reply to a message already answered (a retry with the same id), if any. */
export function answeredReply(chat: PreviewChat, clientId: string) {
  const i = chat.messages.findIndex((m) => m.role === "user" && m.clientId === clientId);
  if (i < 0) return { asked: false, reply: null };
  const next = chat.messages[i + 1];
  return { asked: true, reply: next?.role === "assistant" ? next : null };
}

export function previewToUI(chat: PreviewChat): SageUIMessage[] {
  const care = careData();
  return chat.messages.map((m, i) => ({
    id: m.id,
    role: m.role,
    parts: [
      ...(m.role === "assistant" && chat.messages[i - 1]?.intent === "distress"
        ? [{ type: "data-care" as const, id: "care", data: care }]
        : []),
      { type: "text" as const, text: m.content },
    ],
    metadata: { hintLevel: m.hintLevel, citations: m.citations, rules: m.rules },
  }));
}
