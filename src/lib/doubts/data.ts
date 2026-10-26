import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiStatus } from "@/lib/ai/provider";
import { allowAiCall } from "@/lib/ai/usage-log";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { generateJson } from "@/lib/learning/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  DOUBTS_PER_DAY,
  SUMMARIES_PER_HOUR,
  SUMMARY_SYSTEM,
  answerEmail,
  doubtSummarySchema,
  fallbackSummary,
  summaryPrompt,
  tidySummary,
  type ChatLine,
  type CreateDoubt,
  type DoubtStatus,
  type DoubtSummary,
} from "./schemas";

/**
 * S21 "Ask a human": reads under the user's own client (row-level security
 * decides who sees which doubt), writes with the service role after that
 * check. Teachers and the course's TAs answer; the student is told in-app
 * and, when email is configured, by email.
 */

type UserClient = SupabaseClient<Database>;
export type StaffRole = "teacher" | "ta";

export function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  );
}

// ------------------------------------------------------------------ staff

/** Whether the signed-in user teaches the course, assists it, or neither (under RLS). */
export async function courseRole(supabase: UserClient, userId: string, courseId: string): Promise<StaffRole | null> {
  const [{ data: taught }, { data: ta }] = await Promise.all([
    supabase.from("courses").select("id").eq("id", courseId).eq("teacher_id", userId).maybeSingle(),
    supabase.from("course_tas").select("course_id").eq("course_id", courseId).eq("user_id", userId).maybeSingle(),
  ]);
  return taught ? "teacher" : ta ? "ta" : null;
}

export type StaffCourse = { id: string; name: string; code: string; role: StaffRole };

/** Courses whose doubts this user answers: the ones they teach, then the ones they assist. */
export async function staffCourses(supabase: UserClient, userId: string): Promise<StaffCourse[]> {
  const [{ data: taught }, { data: assisted }] = await Promise.all([
    supabase.from("courses").select("id, name, code").eq("teacher_id", userId).order("code"),
    supabase.from("course_tas").select("course_id").eq("user_id", userId),
  ]);
  const own = (taught ?? []).map((c) => ({ ...c, role: "teacher" as const }));
  const taIds = (assisted ?? []).map((r) => r.course_id).filter((id) => !own.some((c) => c.id === id));
  if (!taIds.length) return own;
  // TAs may not be enrolled, so course names come from the service role after the RLS read above.
  const { data: names } = await createAdminClient().from("courses").select("id, name, code").in("id", taIds).order("code");
  return [...own, ...(names ?? []).map((c) => ({ ...c, role: "ta" as const }))];
}

// ------------------------------------------------------------------ student side

/** The student's own chat (RLS), oldest first, for the summary. */
async function readOwnChat(supabase: UserClient, userId: string, conversationId: string) {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, course_id, assignment_id, courses(name, code), assignments(title, ai_mode)")
    .eq("id", conversationId)
    .eq("student_id", userId)
    .maybeSingle();
  if (!conversation) return null;
  const { data: rows } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(30);
  const lines: ChatLine[] = (rows ?? []).reverse().map((m) => ({ role: m.role, content: m.content }));
  return { conversation, lines };
}

/**
 * "Still stuck? Ask your teacher": a draft of the question, what the student
 * tried and where they're stuck, written from the chat. The student edits it
 * before anything is sent. Falls back to the chat's own words without a model.
 */
export async function draftDoubt(
  supabase: UserClient,
  userId: string,
  conversationId: string,
): Promise<{ summary: DoubtSummary; source: "model" | "chat" | "empty" } | null> {
  const chat = await readOwnChat(supabase, userId, conversationId);
  if (!chat) return null;
  if (!chat.lines.some((l) => l.role === "user")) return { summary: { question: "", tried: "", stuckOn: "" }, source: "empty" };
  const fallback = { summary: fallbackSummary(chat.lines), source: "chat" as const };
  if (!aiStatus().chat) return fallback;
  if (!(await allowAiCall(userId, "doubt_summary", { limit: SUMMARIES_PER_HOUR, windowMs: 60 * 60_000 }))) return fallback;

  const course = chat.conversation.courses;
  const result = await generateJson({
    feature: "doubt_summary",
    userId,
    system: SUMMARY_SYSTEM,
    prompt: summaryPrompt(
      { course: course ? `${course.code ? `${course.code} ` : ""}${course.name}` : "", assignment: chat.conversation.assignments?.title ?? null },
      chat.lines,
    ),
    schema: doubtSummarySchema,
    name: "doubt_summary",
    timeoutMs: 20_000,
    maxOutputTokens: 1200,
    temperature: 0.2,
  });
  if (!result || !result.question.trim()) return fallback;
  return { summary: tidySummary(result), source: "model" };
}

export type CreateResult = { ok: true; id: string } | { ok: false; status: number; message: string };

/** Saves a doubt after checking the course, assignment and chat belong to the student (RLS). */
export async function createDoubt(
  supabase: UserClient,
  user: { id: string; fullName: string },
  input: CreateDoubt,
): Promise<CreateResult> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [{ data: course }, { data: assignment }, { data: conversation }, { count }] = await Promise.all([
    supabase.from("courses").select("id").eq("id", input.courseId).maybeSingle(),
    input.assignmentId
      ? supabase.from("assignments").select("id, course_id, ai_mode").eq("id", input.assignmentId).maybeSingle()
      : Promise.resolve({ data: null }),
    input.conversationId
      ? supabase
          .from("conversations")
          .select("id, course_id, assignment_id")
          .eq("id", input.conversationId)
          .eq("student_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("doubts").select("id", { count: "exact", head: true }).eq("student_id", user.id).gte("created_at", since),
  ]);
  if (!course) return { ok: false, status: 404, message: "We couldn't find this course in your list." };
  if (input.assignmentId && (!assignment || assignment.course_id !== input.courseId)) {
    return { ok: false, status: 404, message: "We couldn't find this assignment in your course." };
  }
  if (input.conversationId && (!conversation || conversation.course_id !== input.courseId)) {
    return { ok: false, status: 404, message: "We couldn't find this chat. Please reload the page." };
  }
  if ((count ?? 0) >= DOUBTS_PER_DAY) {
    return { ok: false, status: 429, message: `You've asked ${DOUBTS_PER_DAY} questions today. Your teacher will get to them — try again tomorrow.` };
  }

  let shared = false;
  if (input.shareChat && conversation) {
    // The student's own switch on their chat (allowed by a column grant).
    const { error } = await supabase.from("conversations").update({ shared_with_teacher: true }).eq("id", conversation.id);
    shared = !error;
  }

  const { data, error } = await createAdminClient()
    .from("doubts")
    .insert({
      course_id: input.courseId,
      assignment_id: input.assignmentId ?? conversation?.assignment_id ?? null,
      student_id: user.id,
      student_name: user.fullName,
      conversation_id: conversation?.id ?? null,
      question: input.question,
      tried: input.tried,
      stuck_on: input.stuckOn,
      chat_shared: shared,
    })
    .select("id")
    .single();
  if (error) {
    console.error("create doubt:", error.message);
    return { ok: false, status: 500, message: "That didn't send. Please try again in a moment." };
  }
  return { ok: true, id: data.id };
}

// ------------------------------------------------------------------ queue

export type DoubtView = {
  id: string;
  courseId: string;
  assignmentId: string | null;
  assignmentTitle: string | null;
  studentId: string;
  studentName: string;
  conversationId: string | null;
  question: string;
  tried: string;
  stuckOn: string;
  chatShared: boolean;
  status: DoubtStatus;
  answer: string;
  answeredByName: string;
  answeredAt: string | null;
  announcementId: string | null;
  createdAt: string;
};

type DoubtRow = Database["public"]["Tables"]["doubts"]["Row"];

const doubtColumns =
  "id, course_id, assignment_id, student_id, student_name, conversation_id, question, tried, stuck_on, chat_shared, status, answer, answered_by_name, answered_at, announcement_id, created_at";

function toView(r: Pick<DoubtRow, keyof DoubtRow>, titles: Map<string, string>): DoubtView {
  return {
    id: r.id,
    courseId: r.course_id,
    assignmentId: r.assignment_id,
    assignmentTitle: r.assignment_id ? (titles.get(r.assignment_id) ?? null) : null,
    studentId: r.student_id,
    studentName: r.student_name,
    conversationId: r.conversation_id,
    question: r.question,
    tried: r.tried,
    stuckOn: r.stuck_on,
    chatShared: r.chat_shared,
    status: r.status as DoubtStatus,
    answer: r.answer,
    answeredByName: r.answered_by_name,
    answeredAt: r.answered_at,
    announcementId: r.announcement_id,
    createdAt: r.created_at,
  };
}

/** Assignment titles for doubts already read under RLS (TAs can't read assignments themselves). */
async function titlesFor(rows: { assignment_id: string | null }[]) {
  const ids = [...new Set(rows.map((r) => r.assignment_id).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, string>();
  const { data } = await createAdminClient().from("assignments").select("id, title").in("id", ids);
  return new Map((data ?? []).map((a) => [a.id, a.title]));
}

/** A course's doubts for its teacher or TAs (RLS decides), newest first. */
export async function courseDoubts(supabase: UserClient, courseIds: string[], status: DoubtStatus | "all" = "all") {
  if (!courseIds.length) return [];
  let query = supabase.from("doubts").select(doubtColumns).in("course_id", courseIds).order("created_at", { ascending: false }).limit(300);
  if (status !== "all") query = query.eq("status", status);
  const { data } = await query;
  const rows = (data ?? []) as DoubtRow[];
  const titles = await titlesFor(rows);
  return rows.map((r) => toView(r, titles));
}

/** Open-doubt counts per course (for the queue's course pills). */
export async function openCounts(supabase: UserClient, courseIds: string[]) {
  if (!courseIds.length) return new Map<string, number>();
  const { data } = await supabase.from("doubts").select("course_id").in("course_id", courseIds).eq("status", "open").limit(2000);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.course_id, (counts.get(r.course_id) ?? 0) + 1);
  return counts;
}

/** The student's own doubts (RLS). */
export async function myDoubts(supabase: UserClient, userId: string) {
  const { data } = await supabase
    .from("doubts")
    .select(doubtColumns)
    .eq("student_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as DoubtRow[];
  const titles = await titlesFor(rows);
  return rows.map((r) => toView(r, titles));
}

export type AnnouncementView = { id: string; courseId: string; title: string; body: string; createdByName: string; doubts: number; createdAt: string };

/** Class announcements the user can read (enrolled, teacher or TA — RLS), last 60 days. */
export async function announcements(supabase: UserClient, courseIds?: string[]): Promise<AnnouncementView[]> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  let query = supabase
    .from("course_announcements")
    .select("id, course_id, title, body, created_by_name, doubts, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  if (courseIds) query = query.in("course_id", courseIds);
  const { data } = await query;
  return (data ?? []).map((a) => ({
    id: a.id,
    courseId: a.course_id,
    title: a.title,
    body: a.body,
    createdByName: a.created_by_name,
    doubts: a.doubts,
    createdAt: a.created_at,
  }));
}

// ------------------------------------------------------------------ answering

/** The doubt, if this user may answer it (RLS read + their role in the course). */
export async function doubtForStaff(supabase: UserClient, userId: string, doubtId: string) {
  const { data } = await supabase.from("doubts").select(doubtColumns).eq("id", doubtId).maybeSingle();
  if (!data) return null;
  const role = await courseRole(supabase, userId, data.course_id);
  return role ? { doubt: data as DoubtRow, role } : null;
}

async function courseName(courseId: string) {
  const { data } = await createAdminClient().from("courses").select("name, code").eq("id", courseId).maybeSingle();
  return data ? `${data.code ? `${data.code} ` : ""}${data.name}` : "your course";
}

/** In-app notices (service role). Failures are logged, never thrown. */
export async function notify(
  rows: { userId: string; kind: "doubt_answered" | "announcement" | "ta_added"; title: string; body?: string; link?: string }[],
) {
  if (!rows.length) return;
  const { error } = await createAdminClient()
    .from("notifications")
    .insert(rows.map((r) => ({ user_id: r.userId, kind: r.kind, title: r.title.slice(0, 200), body: (r.body ?? "").slice(0, 500), link: r.link ?? "" })));
  if (error) console.error("notifications:", error.message);
}

/** Tells the student their doubt was answered: in-app always, by email when configured. */
export async function tellStudent({
  studentId,
  studentName,
  courseId,
  question,
  answer,
  answeredBy,
  announcement,
}: {
  studentId: string;
  studentName: string;
  courseId: string;
  question: string;
  answer: string;
  answeredBy: string;
  announcement: boolean;
}) {
  const course = await courseName(courseId);
  await notify([
    {
      userId: studentId,
      kind: announcement ? "announcement" : "doubt_answered",
      title: `Your question in ${course} has an answer`,
      body: answer.replace(/\s+/g, " ").slice(0, 200),
      link: "/student/doubts",
    },
  ]);
  if (!emailConfigured()) return;
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(studentId);
    const to = data.user?.email;
    if (!to) return;
    const email = answerEmail({
      studentFirstName: studentName.split(" ")[0] ?? "",
      course,
      question,
      answer,
      answeredBy,
      link: `${siteUrl()}/student/doubts`,
      announcement,
    });
    const sent = await sendEmail({ to, ...email });
    if (!sent.ok) console.warn("doubt email:", sent.error);
  } catch (error) {
    console.warn("doubt email:", error instanceof Error ? error.message : error);
  }
}

// ------------------------------------------------------------------ TA overview

export type TaOverview = {
  enrolled: number;
  activeStudents: number;
  messages: number;
  openDoubts: number;
  answeredThisWeek: number;
  topics: { topic: string; count: number }[];
  upcoming: { title: string; dueAt: string | null; mode: "learn" | "assist" | "exam" }[];
};

/**
 * The course overview a TA sees: class-level numbers only (no names, no
 * Reliance Scores, no chat text). Call only after courseRole() said "ta" or
 * "teacher". Last 7 days.
 */
export async function taOverview(courseId: string, now = Date.now()): Promise<TaOverview> {
  const admin = createAdminClient();
  const since = new Date(now - 7 * 86_400_000).toISOString();
  const [{ count: enrolled }, { data: conversations }, { count: openDoubts }, { count: answered }, { data: assignments }] = await Promise.all([
    admin.from("enrollments").select("student_id", { count: "exact", head: true }).eq("course_id", courseId),
    admin.from("conversations").select("id, student_id").eq("course_id", courseId).limit(5000),
    admin.from("doubts").select("id", { count: "exact", head: true }).eq("course_id", courseId).eq("status", "open"),
    admin.from("doubts").select("id", { count: "exact", head: true }).eq("course_id", courseId).gte("answered_at", since),
    admin
      .from("assignments")
      .select("title, due_at, ai_mode")
      .eq("course_id", courseId)
      .or(`due_at.is.null,due_at.gte.${new Date(now).toISOString()}`)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(5),
  ]);
  const owner = new Map((conversations ?? []).map((c) => [c.id, c.student_id]));
  const ids = [...owner.keys()];
  const messages: { conversation_id: string; topic: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin
      .from("messages")
      .select("conversation_id, topic")
      .in("conversation_id", ids.slice(i, i + 200))
      .eq("role", "user")
      .gte("created_at", since)
      .limit(5000);
    messages.push(...(data ?? []));
  }
  const active = new Set(messages.map((m) => owner.get(m.conversation_id)));
  const topics = new Map<string, number>();
  for (const m of messages) {
    const t = m.topic?.trim().toLowerCase();
    if (t) topics.set(t, (topics.get(t) ?? 0) + 1);
  }
  return {
    enrolled: enrolled ?? 0,
    activeStudents: active.size,
    messages: messages.length,
    openDoubts: openDoubts ?? 0,
    answeredThisWeek: answered ?? 0,
    topics: [...topics.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count })),
    upcoming: (assignments ?? []).map((a) => ({ title: a.title, dueAt: a.due_at, mode: a.ai_mode })),
  };
}

/** Teaching assistants of a course, for its teacher (RLS: course teacher reads). */
export async function courseTas(supabase: UserClient, courseId: string) {
  const { data } = await supabase
    .from("course_tas")
    .select("user_id, full_name, email, created_at")
    .eq("course_id", courseId)
    .order("created_at");
  return (data ?? []).map((t) => ({ userId: t.user_id, name: t.full_name, email: t.email, since: t.created_at }));
}

/** Unread in-app notices for the user (RLS: own rows). */
export async function unreadNotifications(supabase: UserClient, userId: string) {
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, created_at")
    .eq("user_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}
