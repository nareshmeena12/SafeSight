import "server-only";
import type { ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { FlagDecision, FlagSeverity, FlagType } from "./flags";
import { fromDbIntent, GENUINE_ATTEMPT, toDbIntent, type Intent, type Labels } from "./labels";
import { assignmentKind, isActive, type SageAssignment } from "./match";
import type { LadderState } from "./policy";
import type { Citation } from "./types";

/**
 * Sage's database side. Reads that prove access use the student's own client
 * (row-level security); everything else — teacher notes, answer keys, ladder
 * state, labels, replies, flags — goes through the service role, server only.
 */

type UserClient = SupabaseClient<Database>;
export type Course = { id: string; name: string; code: string };

const assignmentColumns = "id, course_id, title, instructions, ai_mode, due_at, max_hint_level, worked_examples";

type AssignmentRow = {
  id: string;
  course_id: string;
  title: string;
  instructions: string;
  ai_mode: Database["public"]["Enums"]["ai_mode"];
  due_at: string | null;
  max_hint_level: number;
  worked_examples: boolean;
};

function toAssignment(a: AssignmentRow, secret?: { notes: string; answer_key: string }): SageAssignment {
  return {
    id: a.id,
    courseId: a.course_id,
    title: a.title,
    instructions: a.instructions,
    mode: a.ai_mode,
    kind: assignmentKind(a.title, a.instructions),
    maxHintLevel: a.max_hint_level,
    workedExamples: a.worked_examples,
    dueAt: a.due_at,
    teacherNotes: secret?.notes ?? "",
    answerKey: secret?.answer_key ?? "",
  };
}

/** The assignment and its course, read under RLS (proves enrollment). Null if not the student's. */
export async function readAssignmentChat(supabase: UserClient, assignmentId: string) {
  const { data } = await supabase
    .from("assignments")
    .select(`${assignmentColumns}, courses!inner(id, name, code)`)
    .eq("id", assignmentId)
    .maybeSingle();
  if (!data) return null;
  return { assignment: data as AssignmentRow, course: data.courses as Course };
}

/**
 * Preview Sage: the assignment (or, for Explore, the course) only if the
 * signed-in teacher teaches its course. Read under RLS and checked by owner.
 */
export async function readTeacherChat(
  supabase: UserClient,
  teacherId: string,
  { assignmentId, courseId }: { assignmentId: string | null; courseId: string | null },
) {
  if (assignmentId) {
    const { data } = await supabase
      .from("assignments")
      .select(`${assignmentColumns}, courses!inner(id, name, code, teacher_id)`)
      .eq("id", assignmentId)
      .eq("courses.teacher_id", teacherId)
      .maybeSingle();
    if (!data) return null;
    const { id, name, code } = data.courses;
    return { assignment: data as AssignmentRow, course: { id, name, code } as Course };
  }
  if (!courseId) return null;
  const { data } = await supabase
    .from("courses")
    .select("id, name, code")
    .eq("id", courseId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  return data ? { assignment: null, course: data as Course } : null;
}

/** A course the student is enrolled in, read under RLS. */
export async function readCourse(supabase: UserClient, courseId: string): Promise<Course | null> {
  const { data } = await supabase.from("courses").select("id, name, code").eq("id", courseId).maybeSingle();
  return data ?? null;
}

/**
 * get_assignment_policy for every active assignment in the course, with the
 * teacher-only notes and answer keys (service role). Call only after the
 * student's enrollment was proven under RLS.
 */
export async function activeAssignments(courseId: string, now = Date.now()): Promise<SageAssignment[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("assignments")
    .select(`${assignmentColumns}, secret:assignment_teacher_notes(notes, answer_key)`)
    .eq("course_id", courseId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(40);
  if (error) throw new Error(`assignments: ${error.message}`);
  return (data ?? [])
    .filter((a) => isActive({ dueAt: a.due_at }, now))
    .map((a) => {
      const secret = Array.isArray(a.secret) ? a.secret[0] : a.secret;
      return toAssignment(a, secret ?? undefined);
    });
}

/** One assignment with its secrets (the chat's own, even if it is past the active window). */
export async function assignmentWithSecrets(row: AssignmentRow): Promise<SageAssignment> {
  const { data } = await createAdminClient()
    .from("assignment_teacher_notes")
    .select("notes, answer_key")
    .eq("assignment_id", row.id)
    .maybeSingle();
  return toAssignment(row, data ?? undefined);
}

/** Hint-ladder state per assignment for this student. */
export async function readLadder(studentId: string, assignmentIds: string[]): Promise<Map<string, LadderState>> {
  if (!assignmentIds.length) return new Map();
  const { data, error } = await createAdminClient()
    .from("sage_ladder_state")
    .select("assignment_id, step, attempts, last_example_at")
    .eq("student_id", studentId)
    .in("assignment_id", assignmentIds);
  if (error) throw new Error(`ladder: ${error.message}`);
  return new Map(
    (data ?? []).map((r) => [r.assignment_id, { step: r.step, attempts: r.attempts, lastExampleAt: r.last_example_at }]),
  );
}

/** Ladder state for every assignment of the course (per student per assignment, not per chat). */
export async function readLadderForCourse(studentId: string, courseId: string): Promise<Map<string, LadderState>> {
  const { data, error } = await createAdminClient()
    .from("sage_ladder_state")
    .select("assignment_id, step, attempts, last_example_at, assignments!inner(course_id)")
    .eq("student_id", studentId)
    .eq("assignments.course_id", courseId);
  if (error) throw new Error(`ladder: ${error.message}`);
  return new Map(
    (data ?? []).map((r) => [r.assignment_id, { step: r.step, attempts: r.attempts, lastExampleAt: r.last_example_at }]),
  );
}

export async function saveLadder(studentId: string, assignmentId: string, state: LadderState) {
  const { error } = await createAdminClient().from("sage_ladder_state").upsert(
    {
      student_id: studentId,
      assignment_id: assignmentId,
      step: Math.min(4, Math.max(1, state.step)),
      attempts: state.attempts,
      last_example_at: state.lastExampleAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,assignment_id" },
  );
  if (error) console.error("save ladder:", error.message);
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

export type StoredReply = { id: string; content: string; hintLevel: number | null; citations: Json };

/**
 * Idempotency: a student message already saved under this browser message id
 * (a retry or a double-send), and Sage's reply to it if there is one.
 */
export async function findByClientId(studentId: string, clientId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("messages")
    .select("id, conversation_id, conversations!inner(student_id)")
    .eq("client_id", clientId)
    .eq("conversations.student_id", studentId)
    .maybeSingle();
  if (!data) return null;
  const { data: reply } = await admin
    .from("messages")
    .select("id, content, hint_level, citations")
    .eq("reply_to", data.id)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    messageId: data.id,
    conversationId: data.conversation_id,
    reply: reply ? ({ id: reply.id, content: reply.content, hintLevel: reply.hint_level, citations: reply.citations } satisfies StoredReply) : null,
  };
}

/** True if the conversation is the student's and belongs to this chat (assignment, or Explore in this course). */
export async function ownsConversation(
  supabase: UserClient,
  { conversationId, studentId, assignmentId, courseId }: { conversationId: string; studentId: string; assignmentId: string | null; courseId: string },
) {
  let query = supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("student_id", studentId)
    .eq("course_id", courseId);
  query = assignmentId ? query.eq("assignment_id", assignmentId) : query.is("assignment_id", null);
  const { data } = await query.maybeSingle();
  return Boolean(data);
}

export async function createConversation({
  id,
  studentId,
  assignmentId,
  courseId,
}: {
  id: string;
  studentId: string;
  assignmentId: string | null;
  courseId: string;
}) {
  const { error } = await createAdminClient()
    .from("conversations")
    .insert({ id, student_id: studentId, assignment_id: assignmentId, course_id: courseId });
  if (error) throw new Error(`conversation: ${error.message}`);
}

const HISTORY_LIMIT = 40;

/** The conversation so far, for the model, plus the student's own earlier text. */
export async function readHistory(conversationId: string, excludeMessageId?: string) {
  const { data, error } = await createAdminClient()
    .from("messages")
    .select("id, role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(`history: ${error.message}`);
  const rows = (data ?? []).filter((r) => r.id !== excludeMessageId).reverse();
  return {
    history: rows.map((r) => ({ role: r.role, content: r.content }) as ModelMessage),
    earlierStudentText: rows
      .filter((r) => r.role === "user")
      .map((r) => r.content)
      .join("\n"),
  };
}

/** The student's recent intents and jailbreak attempts in this course (last 24 hours), for flags. */
export async function recentActivity(studentId: string, courseId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from("messages")
    .select("intent, created_at, conversations!inner(student_id, course_id)")
    .eq("conversations.student_id", studentId)
    .eq("conversations.course_id", courseId)
    .eq("role", "user")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`activity: ${error.message}`);
  const intents: (Intent | null)[] = (data ?? []).map((r) => fromDbIntent(r.intent)).reverse();
  return { intents: intents.slice(-10), jailbreaks: intents.filter((i) => i === "jailbreak").length };
}

/** log_interaction, part 1: the student's message, before labels arrive. */
export async function logStudentMessage({
  id,
  conversationId,
  content,
  clientId,
}: {
  id: string;
  conversationId: string;
  content: string;
  clientId: string;
}) {
  const { error } = await createAdminClient()
    .from("messages")
    .insert({ id, conversation_id: conversationId, role: "user", content, client_id: clientId });
  // A unique violation means a parallel request already saved it.
  if (error && error.code !== "23505") throw new Error(`log message: ${error.message}`);
}

/** log_interaction, part 2: classify_message's labels on the student's message. */
export async function labelStudentMessage(messageId: string, labels: Labels) {
  const { error } = await createAdminClient()
    .from("messages")
    .update({
      intent: toDbIntent(labels.intent),
      attempted: labels.attemptQuality >= GENUINE_ATTEMPT,
      attempt_quality: Math.round(labels.attemptQuality * 100) / 100,
      topic: labels.topic || null,
      matched_assignment_id: labels.match.assignmentId,
      match_score: labels.match.similarity,
    })
    .eq("id", messageId);
  if (error) console.error("label message:", error.message);
}

/** log_interaction, part 3: Sage's reply with its ladder step, cited pages, latency and guard outcome. */
export async function logSageReply(reply: {
  id: string;
  conversationId: string;
  replyTo: string;
  content: string;
  hintLevel: number | null;
  citations: Citation[];
  ttftMs: number | null;
  latencyMs: number;
  guard: "pass" | "regenerated" | "safe_hint" | "fixed";
}) {
  const { error } = await createAdminClient()
    .from("messages")
    .insert({
      id: reply.id,
      conversation_id: reply.conversationId,
      reply_to: reply.replyTo,
      role: "assistant",
      content: reply.content || "…",
      hint_level: reply.hintLevel,
      citations: reply.citations as unknown as NonNullable<Json>,
      ttft_ms: reply.ttftMs,
      latency_ms: reply.latencyMs,
      guard: reply.guard,
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
