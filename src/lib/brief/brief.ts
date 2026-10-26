import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/learning/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { weekStart } from "@/lib/teacher/dates";
import { nameTokens, scrubText } from "./anonymise";
import {
  assembleMisconceptions,
  assembleQuiz,
  BRIEF_SYSTEM_PROMPT,
  briefOutputSchema,
  briefPrompt,
  briefStatsSchema,
  enoughToBrief,
  QUIZ_SYSTEM_PROMPT,
  quizOutputSchema,
  quizPrompt,
  selectMessages,
  storedMisconceptionsSchema,
  storedQuizSchema,
  type BriefMessage,
  type BriefStats,
  type Misconception,
  type QuizQuestion,
} from "./schema";

type Db = SupabaseClient<Database>;

export type Brief = {
  id: string;
  courseId: string;
  week: string;
  periodStart: string;
  periodEnd: string;
  source: "schedule" | "teacher";
  misconceptions: Misconception[];
  quiz: QuizQuestion[];
  stats: BriefStats;
  updatedAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Intents that aren't about the subject: never read for a brief. */
const SKIPPED_INTENTS = new Set(["distress", "jailbreak", "off_topic"]);

type BriefRow = Database["public"]["Tables"]["lecture_briefs"]["Row"];

function toBrief(row: BriefRow): Brief {
  const misconceptions = storedMisconceptionsSchema.safeParse(row.misconceptions);
  const quiz = storedQuizSchema.safeParse(row.quiz);
  return {
    id: row.id,
    courseId: row.course_id,
    week: row.week,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    source: row.source === "schedule" ? "schedule" : "teacher",
    misconceptions: misconceptions.success ? misconceptions.data : [],
    quiz: quiz.success ? quiz.data : [],
    stats: briefStatsSchema.parse(row.stats ?? {}),
    updatedAt: row.updated_at,
  };
}

/** The latest brief for each course (teacher's client: RLS keeps it to their own courses). */
export async function latestBriefs(db: Db, courseIds: string[]): Promise<Map<string, Brief>> {
  const result = new Map<string, Brief>();
  if (courseIds.length === 0) return result;
  const { data, error } = await db
    .from("lecture_briefs")
    .select("*")
    .in("course_id", courseIds)
    .order("week", { ascending: false })
    .limit(courseIds.length * 4);
  if (error) throw new Error(`lecture_briefs: ${error.message}`);
  for (const row of data) if (!result.has(row.course_id)) result.set(row.course_id, toBrief(row));
  return result;
}

export async function readBrief(db: Db, briefId: string): Promise<Brief | null> {
  const { data } = await db.from("lecture_briefs").select("*").eq("id", briefId).maybeSingle();
  return data ? toBrief(data) : null;
}

/**
 * What the brief may read for a course: student messages to Sage in the
 * period, scrubbed of names and contact details. Skips Exam-mode chats,
 * distress, jailbreaks and off-topic messages. Service role: the caller has
 * already checked the teacher (or is the scheduled job).
 */
async function readCourseMessages(courseId: string, from: Date, to: Date) {
  const admin = createAdminClient();
  const [course, roster, messages] = await Promise.all([
    admin.from("courses").select("name, code, teacher:profiles!courses_teacher_id_fkey(full_name)").eq("id", courseId).maybeSingle(),
    admin.from("enrollments").select("student:profiles(full_name)").eq("course_id", courseId),
    admin
      .from("messages")
      .select("id, content, topic, intent, created_at, conversation:conversations!inner(student_id, course_id, assignment:assignments(ai_mode))")
      .eq("role", "user")
      .eq("conversation.course_id", courseId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(800),
  ]);
  if (course.error || !course.data) throw new Error(`course: ${course.error?.message ?? "not found"}`);
  if (roster.error) throw new Error(`enrollments: ${roster.error.message}`);
  if (messages.error) throw new Error(`messages: ${messages.error.message}`);

  const names = nameTokens([
    ...roster.data.map((r) => r.student?.full_name ?? ""),
    course.data.teacher?.full_name ?? "",
  ]);
  const list: BriefMessage[] = [];
  for (const m of messages.data) {
    if (m.intent && SKIPPED_INTENTS.has(m.intent)) continue;
    if (m.conversation.assignment?.ai_mode === "exam") continue;
    const text = scrubText(m.content, names);
    if (text.length < 4) continue;
    list.push({ id: m.id, studentId: m.conversation.student_id, text, topic: m.topic, intent: m.intent, at: m.created_at });
  }
  return {
    course: course.data.code ? `${course.data.code} · ${course.data.name}` : course.data.name,
    enrolled: roster.data.length,
    messages: list,
  };
}

export type BriefResult = { status: "ok"; brief: Brief } | { status: "failed" };

/**
 * Builds and saves this week's brief for a course: two structured-JSON calls
 * (misconceptions, then the quiz), each with a timeout and one more attempt.
 * With too little activity it saves an empty brief so the page can say so.
 * `teacherId` is who the tokens are logged for (the course teacher, also for
 * the scheduled run).
 */
export async function generateBrief({
  courseId,
  teacherId,
  source,
  now = new Date(),
  signal,
}: {
  courseId: string;
  teacherId: string;
  source: "schedule" | "teacher";
  now?: Date;
  signal?: AbortSignal;
}): Promise<BriefResult> {
  const from = new Date(now.getTime() - 7 * DAY_MS);
  const { course, enrolled, messages } = await readCourseMessages(courseId, from, now);
  const selected = selectMessages(messages);
  const stats: BriefStats = {
    messages: messages.length,
    students: new Set(messages.map((m) => m.studentId)).size,
    enrolled,
  };

  let misconceptions: Misconception[] = [];
  let quiz: QuizQuestion[] = [];
  if (enoughToBrief(selected)) {
    for (let round = 0; round < 2 && misconceptions.length === 0; round++) {
      const output = await generateJson({
        feature: "lecture_brief",
        userId: teacherId,
        system: BRIEF_SYSTEM_PROMPT,
        prompt: briefPrompt({ course, messages: selected }) + (round ? "\n\nUse only refs from the list, and keep every word neutral." : ""),
        schema: briefOutputSchema,
        name: "lecture_brief",
        timeoutMs: 40_000,
        maxOutputTokens: 3000,
        temperature: 0.3,
        signal,
      });
      if (!output) break;
      misconceptions = assembleMisconceptions(output, selected) ?? [];
    }
    if (misconceptions.length === 0) return { status: "failed" };

    for (let round = 0; round < 2 && quiz.length === 0; round++) {
      const output = await generateJson({
        feature: "lecture_brief_quiz",
        userId: teacherId,
        system: QUIZ_SYSTEM_PROMPT,
        prompt: quizPrompt({ course, misconceptions }) + (round ? "\n\nFour different options per question; neutral wording." : ""),
        schema: quizOutputSchema,
        name: "lecture_quiz",
        timeoutMs: 30_000,
        maxOutputTokens: 2500,
        temperature: 0.4,
        signal,
      });
      if (!output) break;
      quiz = assembleQuiz(output, misconceptions.length) ?? [];
    }
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("lecture_briefs")
    .upsert(
      {
        course_id: courseId,
        week: weekStart(now),
        period_start: from.toISOString(),
        period_end: now.toISOString(),
        source,
        misconceptions,
        quiz,
        stats,
        created_by: source === "teacher" ? teacherId : null,
        updated_at: nowIso,
      },
      { onConflict: "course_id,week" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`lecture_briefs: ${error.message}`);
  return { status: "ok", brief: toBrief(data) };
}
