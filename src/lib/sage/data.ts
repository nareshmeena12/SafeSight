import "server-only";
import type { ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiMode } from "@/components/product/mode-badge";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { FlagDecision, FlagSeverity, FlagType } from "./flags";
import { heuristicLabels, type Intent, type Labels } from "./labels";
import type { Citation } from "./types";

/**
 * Sage's server-side tools (PLAN.md §4) as plain functions the route runs on
 * every turn. Only search_course_material is a model-callable tool; the rest
 * run deterministically so the model can't skip them. Reads that prove access
 * use the student's own client (row-level security); labels, replies and
 * flags are written with the service role.
 */

type UserClient = SupabaseClient<Database>;

export type AssignmentPolicy = {
  id: string;
  title: string;
  instructions: string;
  mode: AiMode;
  dueAt: string | null;
  course: { id: string; name: string; code: string };
  /** Teacher-only. Never send to the browser. */
  teacherNotes: string;
};

/** get_assignment_policy. Null if the assignment doesn't exist or the student isn't enrolled. */
export async function getAssignmentPolicy(
  supabase: UserClient,
  assignmentId: string,
): Promise<AssignmentPolicy | null> {
  const { data: a } = await supabase
    .from("assignments")
    .select("id, title, instructions, ai_mode, due_at, courses!inner(id, name, code)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a) return null;

  const { data: notes } = await createAdminClient()
    .from("assignment_teacher_notes")
    .select("notes")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  return {
    id: a.id,
    title: a.title,
    instructions: a.instructions,
    mode: a.ai_mode,
    dueAt: a.due_at,
    course: { id: a.courses.id, name: a.courses.name, code: a.courses.code },
    teacherNotes: notes?.notes ?? "",
  };
}

export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export function rateLimitPerHour() {
  const n = Number(process.env.SAGE_RATE_LIMIT_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
}

/** ~60 Sage messages per student per hour (PLAN.md §9). */
export async function checkRateLimit(studentId: string, now = Date.now()) {
  const limit = rateLimitPerHour();
  const since = new Date(now - RATE_LIMIT_WINDOW_MS).toISOString();
  const { data, count, error } = await createAdminClient()
    .from("messages")
    .select("created_at, conversations!inner(student_id)", { count: "exact" })
    .eq("conversations.student_id", studentId)
    .eq("role", "user")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`rate limit: ${error.message}`);
  const used = count ?? 0;
  if (used < limit) return { allowed: true as const, limit, used };
  const oldest = data?.[0] ? new Date(data[0].created_at).getTime() : now;
  const retryAfterMinutes = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 60_000));
  return { allowed: false as const, limit, used, retryAfterMinutes };
}

/**
 * The conversation for this turn: the given one if it belongs to the student
 * and assignment, or a new one. Null if the given id isn't theirs.
 */
export async function resolveConversation(
  supabase: UserClient,
  { studentId, assignmentId, conversationId }: { studentId: string; assignmentId: string; conversationId: string | null },
): Promise<string | null> {
  if (conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("student_id", studentId)
      .eq("assignment_id", assignmentId)
      .maybeSingle();
    return data?.id ?? null;
  }
  const { data, error } = await supabase
    .from("conversations")
    .insert({ student_id: studentId, assignment_id: assignmentId })
    .select("id")
    .single();
  if (error) throw new Error(`conversation: ${error.message}`);
  return data.id;
}

export type StudentProgress = {
  /** Conversation so far, oldest first, for the model. */
  history: ModelMessage[];
  /** Sage's last hint-ladder step, or null before the first reply. */
  currentLevel: number | null;
  /** Intents of the student's earlier messages, oldest first. */
  recentIntents: (Intent | null)[];
  /** Earlier attempts in this conversation to change Sage's rules. */
  overrides: number;
};

const HISTORY_LIMIT = 40;

/** get_student_progress for one conversation. */
export async function getStudentProgress(conversationId: string): Promise<StudentProgress> {
  const { data, error } = await createAdminClient()
    .from("messages")
    .select("role, content, intent, hint_level")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(`progress: ${error.message}`);
  const rows = (data ?? []).reverse();
  const user = rows.filter((r) => r.role === "user");
  return {
    history: rows.map((r) => ({ role: r.role, content: r.content })),
    currentLevel: rows.findLast((r) => r.role === "assistant" && r.hint_level)?.hint_level ?? null,
    recentIntents: user.map((r) => r.intent),
    overrides: user.filter((r) => heuristicLabels(r.content).instructionOverride).length,
  };
}

/** log_interaction, part 1: the student's message, before labels arrive. */
export async function logStudentMessage(conversationId: string, content: string): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("messages")
    .insert({ conversation_id: conversationId, role: "user", content })
    .select("id")
    .single();
  if (error) throw new Error(`log message: ${error.message}`);
  return data.id;
}

/** log_interaction, part 2: classify_message's labels on the student's message. */
export async function labelStudentMessage(messageId: string, labels: Labels) {
  const { error } = await createAdminClient()
    .from("messages")
    .update({ intent: labels.intent, attempted: labels.attempted, topic: labels.topic || null })
    .eq("id", messageId);
  if (error) console.error("label message:", error.message);
}

/** log_interaction, part 3: Sage's reply with its ladder step and cited pages. */
export async function logSageReply({
  id,
  conversationId,
  content,
  hintLevel,
  citations,
}: {
  id: string;
  conversationId: string;
  content: string;
  hintLevel: number | null;
  citations: Citation[];
}) {
  const { error } = await createAdminClient()
    .from("messages")
    .insert({
      id,
      conversation_id: conversationId,
      role: "assistant",
      content: content || "…",
      hint_level: hintLevel,
      citations: citations as unknown as NonNullable<Json>,
    });
  if (error) console.error("log reply:", error.message);
}

/** Open flags for this student and course from the last 24 hours (for de-duplication). */
export async function recentOpenFlags(studentId: string, courseId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from("flags")
    .select("type, severity")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .eq("status", "open")
    .gte("created_at", since);
  if (error) throw new Error(`flags: ${error.message}`);
  return (data ?? []) as { type: FlagType; severity: FlagSeverity }[];
}

/** flag_to_teacher. */
export async function raiseFlags({
  studentId,
  courseId,
  messageId,
  decisions,
}: {
  studentId: string;
  courseId: string;
  messageId: string;
  decisions: FlagDecision[];
}) {
  if (!decisions.length) return;
  const { error } = await createAdminClient()
    .from("flags")
    .insert(
      decisions.map((d) => ({
        student_id: studentId,
        course_id: courseId,
        message_id: messageId,
        type: d.type,
        severity: d.severity,
        reason: d.reason,
      })),
    );
  if (error) console.error("raise flags:", error.message);
}

/** True if the course has at least one searchable material. */
export async function courseHasMaterials(courseId: string) {
  const { count } = await createAdminClient()
    .from("materials")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("status", "ready");
  return (count ?? 0) > 0;
}
