import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { daysAgo, weeksAgo } from "./dates";

/**
 * Read-only queries behind the teacher dashboard and Lens. Every function takes
 * the signed-in teacher's Supabase client, so row-level security applies on
 * top of the explicit course filters: a teacher only ever sees their own
 * courses. Message text is never read here (PLAN.md §9).
 */
export type Db = SupabaseClient<Database>;

export type FlagType = Database["public"]["Enums"]["flag_type"];
export type FlagSeverity = Database["public"]["Enums"]["flag_severity"];
export type FlagStatus = Database["public"]["Enums"]["flag_status"];
export type AiMode = Database["public"]["Enums"]["ai_mode"];

export type CourseSummary = {
  id: string;
  name: string;
  code: string;
  joinCode: string;
  createdAt: string;
  students: number;
  assignments: number;
};

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- courses

export async function listCourses(db: Db, teacherId: string): Promise<CourseSummary[]> {
  const { data, error } = await db
    .from("courses")
    .select("id, name, code, join_code, created_at, enrollments(count), assignments(count)")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: true });
  if (error) fail("listCourses", error);
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    joinCode: c.join_code,
    createdAt: c.created_at,
    students: c.enrollments[0]?.count ?? 0,
    assignments: c.assignments[0]?.count ?? 0,
  }));
}

/**
 * The course ids a query may touch: all of the teacher's courses, or the one
 * asked for if the teacher runs it. Returns null for a course that is not
 * theirs, so callers can say "not found" instead of leaking anything.
 */
export async function courseScope(
  db: Db,
  teacherId: string,
  courseId?: string | null,
): Promise<{ id: string; name: string; code: string }[] | null> {
  let query = db.from("courses").select("id, name, code").eq("teacher_id", teacherId);
  if (courseId) query = query.eq("id", courseId);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) fail("courseScope", error);
  if (courseId && data.length === 0) return null;
  return data;
}

export type CourseDetail = {
  course: CourseSummary;
  assignments: {
    id: string;
    title: string;
    instructions: string;
    aiMode: AiMode;
    teacherNotes: string;
    dueAt: string | null;
    createdAt: string;
  }[];
  roster: { id: string; name: string; joinedAt: string }[];
};

export async function getCourseDetail(
  db: Db,
  teacherId: string,
  courseId: string,
): Promise<CourseDetail | null> {
  const courses = await listCourses(db, teacherId);
  const course = courses.find((c) => c.id === courseId);
  if (!course) return null;

  const [assignments, roster] = await Promise.all([
    db
      .from("assignments")
      .select("id, title, instructions, ai_mode, due_at, created_at, notes:assignment_teacher_notes(notes)")
      .eq("course_id", courseId)
      .order("due_at", { ascending: true, nullsFirst: false }),
    db
      .from("enrollments")
      .select("student_id, created_at, student:profiles(full_name)")
      .eq("course_id", courseId),
  ]);
  if (assignments.error) fail("assignments", assignments.error);
  if (roster.error) fail("roster", roster.error);

  return {
    course,
    assignments: assignments.data.map((a) => ({
      id: a.id,
      title: a.title,
      instructions: a.instructions,
      aiMode: a.ai_mode,
      // Teacher-only notes for Sage live in their own table (one row or none).
      teacherNotes: (Array.isArray(a.notes) ? a.notes[0]?.notes : a.notes?.notes) ?? "",
      dueAt: a.due_at,
      createdAt: a.created_at,
    })),
    roster: roster.data
      .map((r) => ({ id: r.student_id, name: r.student?.full_name || "Unnamed student", joinedAt: r.created_at }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ---------------------------------------------------------------- metrics

type MetricRow = { student_id: string; course_id: string; week: string; messages: number; reliance_score: number };

async function weeklyMetrics(db: Db, courseIds: string[], sinceWeek: string): Promise<MetricRow[]> {
  if (courseIds.length === 0) return [];
  const { data, error } = await db
    .from("weekly_metrics")
    .select("student_id, course_id, week, messages, reliance_score")
    .in("course_id", courseIds)
    .gte("week", sinceWeek)
    .order("week", { ascending: true })
    .limit(10_000);
  if (error) fail("weeklyMetrics", error);
  return data;
}

/** Latest weekly Reliance Score per student (averaged over their courses). */
function latestScores(rows: MetricRow[]): Map<string, { score: number; week: string }> {
  const perPair = new Map<string, MetricRow>();
  for (const row of rows) {
    const key = `${row.student_id}:${row.course_id}`;
    const prev = perPair.get(key);
    if (!prev || row.week > prev.week) perPair.set(key, row);
  }
  const perStudent = new Map<string, MetricRow[]>();
  for (const row of perPair.values()) {
    perStudent.set(row.student_id, [...(perStudent.get(row.student_id) ?? []), row]);
  }
  const result = new Map<string, { score: number; week: string }>();
  for (const [studentId, list] of perStudent) {
    const week = list.reduce((w, r) => (r.week > w ? r.week : w), list[0].week);
    result.set(studentId, { score: round1(mean(list.map((r) => r.reliance_score)) ?? 0), week });
  }
  return result;
}

export type TrendPoint = { week: string; avgReliance: number | null; messages: number; activeStudents: number };

/** One point per week for the last `weeks` weeks, oldest first. */
function weeklyTrend(rows: MetricRow[], now: Date, weeks: number): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const week = weeksAgo(now, i);
    const inWeek = rows.filter((r) => r.week === week);
    const avg = mean(inWeek.map((r) => r.reliance_score));
    points.push({
      week,
      avgReliance: avg === null ? null : round1(avg),
      messages: inWeek.reduce((s, r) => s + r.messages, 0),
      activeStudents: new Set(inWeek.filter((r) => r.messages > 0).map((r) => r.student_id)).size,
    });
  }
  return points;
}

// ---------------------------------------------------------------- overview

export type ClassOverview = {
  scope: { id: string; name: string; code: string }[];
  from: string;
  to: string;
  enrolledStudents: number;
  activeStudents: number;
  conversations: number;
  messages: number;
  answerSeekingShare: number | null;
  avgReliance: number | null;
  relianceWeek: string | null;
  openFlags: number;
  highSeverityFlags: number;
  trend: TrendPoint[];
};

export async function getClassOverview(
  db: Db,
  teacherId: string,
  opts: { courseId?: string | null; from?: string; to?: string; weeks?: number; now?: Date } = {},
): Promise<ClassOverview | null> {
  const now = opts.now ?? new Date();
  const from = opts.from ?? daysAgo(now, 7);
  const to = opts.to ?? now.toISOString();
  const weeks = opts.weeks ?? 8;

  const scope = await courseScope(db, teacherId, opts.courseId);
  if (!scope) return null;
  const ids = scope.map((c) => c.id);
  if (ids.length === 0) {
    return {
      scope, from, to, enrolledStudents: 0, activeStudents: 0, conversations: 0, messages: 0,
      answerSeekingShare: null, avgReliance: null, relianceWeek: null, openFlags: 0,
      highSeverityFlags: 0, trend: weeklyTrend([], now, weeks),
    };
  }

  const [activity, metrics, flags] = await Promise.all([
    db.rpc("teacher_student_activity", { p_course_id: opts.courseId ?? undefined, p_from: from, p_to: to }),
    weeklyMetrics(db, ids, weeksAgo(now, weeks - 1)),
    db.from("flags").select("severity").in("course_id", ids).eq("status", "open"),
  ]);
  if (activity.error) fail("teacher_student_activity", activity.error);
  if (flags.error) fail("flags", flags.error);

  const rows = activity.data;
  const messages = rows.reduce((s, r) => s + r.messages, 0);
  const answerSeeking = rows.reduce((s, r) => s + r.answer_seeking, 0);

  // Average Reliance over the most recent week that has numbers.
  const latestWeek = metrics.reduce<string | null>((w, r) => (!w || r.week > w ? r.week : w), null);
  const latest = latestWeek ? metrics.filter((r) => r.week === latestWeek) : [];
  const avg = mean(latest.map((r) => r.reliance_score));

  return {
    scope,
    from,
    to,
    enrolledStudents: new Set(rows.map((r) => r.student_id)).size,
    activeStudents: new Set(rows.filter((r) => r.messages > 0).map((r) => r.student_id)).size,
    conversations: rows.reduce((s, r) => s + r.conversations, 0),
    messages,
    answerSeekingShare: messages > 0 ? answerSeeking / messages : null,
    avgReliance: avg === null ? null : round1(avg),
    relianceWeek: latestWeek,
    openFlags: flags.data.length,
    highSeverityFlags: flags.data.filter((f) => f.severity === "high").length,
    trend: weeklyTrend(metrics, now, weeks),
  };
}

export type TopicStruggle = { topic: string; messages: number; students: number; answerSeeking: number };

export async function getTopicStruggles(
  db: Db,
  opts: { courseId?: string | null; studentId?: string | null; from?: string | null; to?: string | null; limit?: number } = {},
): Promise<TopicStruggle[]> {
  const { data, error } = await db.rpc("teacher_topic_struggles", {
    p_course_id: opts.courseId ?? undefined,
    p_student_id: opts.studentId ?? undefined,
    p_from: opts.from ?? undefined,
    p_to: opts.to ?? undefined,
    p_limit: opts.limit ?? 5,
  });
  if (error) fail("teacher_topic_struggles", error);
  return data.map((t) => ({
    topic: t.topic,
    messages: t.messages,
    students: t.students,
    answerSeeking: t.answer_seeking,
  }));
}

// ---------------------------------------------------------------- students

export type StudentRow = {
  id: string;
  name: string;
  courses: { id: string; name: string; code: string }[];
  conversations: number;
  messages: number;
  answerSeeking: number;
  lastActiveAt: string | null;
  reliance: number | null;
  relianceWeek: string | null;
  openFlags: number;
};

/** One row per student across the teacher's courses (or one course). */
export async function getStudentRows(
  db: Db,
  teacherId: string,
  opts: { courseId?: string | null; from?: string; now?: Date } = {},
): Promise<StudentRow[] | null> {
  const now = opts.now ?? new Date();
  const scope = await courseScope(db, teacherId, opts.courseId);
  if (!scope) return null;
  const ids = scope.map((c) => c.id);
  if (ids.length === 0) return [];

  const [roster, activity, metrics, flags] = await Promise.all([
    db.from("enrollments").select("course_id, student_id, student:profiles(full_name)").in("course_id", ids),
    db.rpc("teacher_student_activity", { p_course_id: opts.courseId ?? undefined, p_from: opts.from ?? daysAgo(now, 30) }),
    weeklyMetrics(db, ids, weeksAgo(now, 7)),
    db.from("flags").select("student_id").in("course_id", ids).eq("status", "open"),
  ]);
  if (roster.error) fail("roster", roster.error);
  if (activity.error) fail("teacher_student_activity", activity.error);
  if (flags.error) fail("flags", flags.error);

  const courseById = new Map(scope.map((c) => [c.id, c]));
  const scores = latestScores(metrics);
  const rows = new Map<string, StudentRow>();
  for (const r of roster.data) {
    const row = rows.get(r.student_id) ?? {
      id: r.student_id,
      name: r.student?.full_name || "Unnamed student",
      courses: [],
      conversations: 0,
      messages: 0,
      answerSeeking: 0,
      lastActiveAt: null,
      reliance: scores.get(r.student_id)?.score ?? null,
      relianceWeek: scores.get(r.student_id)?.week ?? null,
      openFlags: 0,
    };
    const course = courseById.get(r.course_id);
    if (course) row.courses.push(course);
    rows.set(r.student_id, row);
  }
  for (const a of activity.data) {
    const row = rows.get(a.student_id);
    if (!row) continue;
    row.conversations += a.conversations;
    row.messages += a.messages;
    row.answerSeeking += a.answer_seeking;
    if (a.last_active_at && (!row.lastActiveAt || a.last_active_at > row.lastActiveAt)) {
      row.lastActiveAt = a.last_active_at;
    }
  }
  for (const f of flags.data) {
    const row = rows.get(f.student_id);
    if (row) row.openFlags += 1;
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Students on the teacher's rosters whose name contains `query`. */
export async function findStudents(db: Db, teacherId: string, query: string, limit = 5) {
  const rows = (await getStudentRows(db, teacherId)) ?? [];
  const q = query.trim().toLowerCase();
  const exact = rows.filter((r) => r.name.toLowerCase() === q);
  if (exact.length > 0) return exact;
  return rows.filter((r) => r.name.toLowerCase().includes(q)).slice(0, limit);
}

export type FlagItem = {
  id: string;
  type: FlagType;
  severity: FlagSeverity;
  status: FlagStatus;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  student: { id: string; name: string };
  course: { id: string; name: string; code: string };
  /** Set when the flag points at a message, so its chat can be opened. */
  messageId: string | null;
};

export async function listFlags(
  db: Db,
  teacherId: string,
  opts: {
    courseId?: string | null;
    studentId?: string | null;
    status?: FlagStatus | "all";
    type?: FlagType | null;
    severity?: FlagSeverity | null;
    limit?: number;
  } = {},
): Promise<FlagItem[] | null> {
  const scope = await courseScope(db, teacherId, opts.courseId);
  if (!scope) return null;
  const ids = scope.map((c) => c.id);
  if (ids.length === 0) return [];

  let query = db
    .from("flags")
    .select("id, type, severity, status, reason, created_at, resolved_at, message_id, course_id, student_id, student:profiles(full_name)")
    .in("course_id", ids);
  const status = opts.status ?? "open";
  if (status !== "all") query = query.eq("status", status);
  if (opts.studentId) query = query.eq("student_id", opts.studentId);
  if (opts.type) query = query.eq("type", opts.type);
  if (opts.severity) query = query.eq("severity", opts.severity);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (error) fail("listFlags", error);

  const courseById = new Map(scope.map((c) => [c.id, c]));
  const severityRank: Record<FlagSeverity, number> = { high: 0, medium: 1, low: 2 };
  return data
    .map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      status: f.status,
      reason: f.reason,
      createdAt: f.created_at,
      resolvedAt: f.resolved_at,
      student: { id: f.student_id, name: f.student?.full_name || "Unnamed student" },
      course: courseById.get(f.course_id) ?? { id: f.course_id, name: "Course", code: "" },
      messageId: f.message_id,
    }))
    .sort((a, b) =>
      a.status === b.status ? severityRank[a.severity] - severityRank[b.severity] : a.status === "open" ? -1 : 1,
    );
}

export type ConversationView = {
  id: string;
  student: { id: string; name: string };
  assignmentTitle: string | null;
  courseId: string | null;
  startedAt: string;
  shared: boolean;
  flags: FlagItem[];
  /** Empty when the chat is private: not flagged in this course and not shared. */
  messages: { id: string; role: "user" | "assistant"; content: string; createdAt: string; flagged: boolean }[];
};

/**
 * A chat as the teacher may see it. Row-level security returns message text
 * only when a message in it is flagged in the teacher's course or the student
 * shared it (PLAN.md §9); otherwise `messages` is empty.
 */
export async function getConversation(db: Db, teacherId: string, conversationId: string): Promise<ConversationView | null> {
  const { data: conv, error } = await db
    .from("conversations")
    .select("id, student_id, started_at, shared_with_teacher, assignment:assignments(title, course_id, course:courses(teacher_id))")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) fail("conversation", error);
  if (!conv || conv.assignment?.course?.teacher_id !== teacherId) return null;

  const [messages, student] = await Promise.all([
    db
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500),
    db.from("profiles").select("full_name").eq("id", conv.student_id).maybeSingle(),
  ]);
  if (messages.error) fail("messages", messages.error);

  const ids = messages.data.map((m) => m.id);
  const flags = ((await listFlags(db, teacherId, { studentId: conv.student_id, status: "all", limit: 200 })) ?? []).filter(
    (f) => f.messageId && ids.includes(f.messageId),
  );
  const flagged = new Set(flags.map((f) => f.messageId));

  return {
    id: conv.id,
    student: { id: conv.student_id, name: student.data?.full_name || "Unnamed student" },
    assignmentTitle: conv.assignment?.title ?? null,
    courseId: conv.assignment?.course_id ?? null,
    startedAt: conv.started_at,
    shared: conv.shared_with_teacher,
    flags,
    messages: messages.data.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
      flagged: flagged.has(m.id),
    })),
  };
}

/** Conversation id per flag id, for "Open chat" links (null when a flag has no message). */
export async function conversationsForFlags(db: Db, flags: FlagItem[]): Promise<Record<string, string | null>> {
  const messageIds = flags.map((f) => f.messageId).filter((id): id is string => Boolean(id));
  const byMessage = new Map<string, string>();
  if (messageIds.length > 0) {
    const { data, error } = await db.from("messages").select("id, conversation_id").in("id", messageIds);
    if (error) fail("messages", error);
    for (const m of data) byMessage.set(m.id, m.conversation_id);
  }
  return Object.fromEntries(flags.map((f) => [f.id, f.messageId ? (byMessage.get(f.messageId) ?? null) : null]));
}

// ---------------------------------------------------------------- one student

export type SubmissionItem = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  aiMode: AiMode;
  courseId: string;
  submittedAt: string | null;
  updatedAt: string;
  report: { pasteRatio: number; activeMinutes: number; sessions: number; summary: string } | null;
};

export type StudentDetail = {
  student: StudentRow;
  trend: TrendPoint[];
  topics: TopicStruggle[];
  flags: FlagItem[];
  submissions: SubmissionItem[];
  sharedConversations: { id: string; assignmentTitle: string | null; startedAt: string }[];
};

export async function getStudentDetail(
  db: Db,
  teacherId: string,
  studentId: string,
  opts: { now?: Date; weeks?: number } = {},
): Promise<StudentDetail | null> {
  const now = opts.now ?? new Date();
  const weeks = opts.weeks ?? 8;
  const rows = await getStudentRows(db, teacherId, { now });
  const student = rows?.find((r) => r.id === studentId);
  if (!student) return null;
  const ids = student.courses.map((c) => c.id);

  const [metrics, topics, flags, submissions, shared] = await Promise.all([
    db
      .from("weekly_metrics")
      .select("student_id, course_id, week, messages, reliance_score")
      .eq("student_id", studentId)
      .in("course_id", ids)
      .gte("week", weeksAgo(now, weeks - 1)),
    getTopicStruggles(db, { studentId, limit: 8 }),
    listFlags(db, teacherId, { studentId, status: "all", limit: 50 }),
    db
      .from("submissions")
      .select("id, assignment_id, submitted_at, updated_at, assignment:assignments!inner(title, ai_mode, course_id), report:integrity_reports(paste_ratio, active_minutes, sessions, summary)")
      .eq("student_id", studentId)
      .in("assignment.course_id", ids)
      .order("updated_at", { ascending: false })
      .limit(50),
    db
      .from("conversations")
      .select("id, started_at, assignment:assignments!inner(title, course_id)")
      .eq("student_id", studentId)
      .eq("shared_with_teacher", true)
      .in("assignment.course_id", ids)
      .order("started_at", { ascending: false })
      .limit(20),
  ]);
  if (metrics.error) fail("weekly_metrics", metrics.error);
  if (submissions.error) fail("submissions", submissions.error);
  if (shared.error) fail("conversations", shared.error);

  return {
    student,
    trend: weeklyTrend(metrics.data, now, weeks),
    topics,
    flags: flags ?? [],
    submissions: submissions.data.map((s) => {
      const report = Array.isArray(s.report) ? s.report[0] : s.report;
      return {
        id: s.id,
        assignmentId: s.assignment_id,
        assignmentTitle: s.assignment.title,
        aiMode: s.assignment.ai_mode,
        courseId: s.assignment.course_id,
        submittedAt: s.submitted_at,
        updatedAt: s.updated_at,
        report: report
          ? {
              pasteRatio: report.paste_ratio,
              activeMinutes: report.active_minutes,
              sessions: report.sessions,
              summary: report.summary,
            }
          : null,
      };
    }),
    sharedConversations: shared.data.map((c) => ({
      id: c.id,
      assignmentTitle: c.assignment.title,
      startedAt: c.started_at,
    })),
  };
}
