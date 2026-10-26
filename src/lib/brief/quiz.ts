import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { readBrief } from "./brief";
import {
  isQuizOpen,
  questionsForStudent,
  randomQuizCode,
  tallyResponses,
  type QuestionResult,
  type StudentQuestion,
} from "./quiz-schema";
import { storedQuizSchema, type QuizQuestion } from "./schema";

type Db = SupabaseClient<Database>;

export type TeacherQuizView = {
  id: string;
  briefId: string;
  courseId: string;
  code: string;
  open: boolean;
  createdAt: string;
  expiresAt: string;
  questions: QuizQuestion[];
  results: QuestionResult[];
  participants: number;
  enrolled: number;
};

/** Starts a live run of a brief's quiz. `db` is the teacher's client: RLS proves the brief is theirs. */
export async function startQuizSession(db: Db, briefId: string, teacherId: string) {
  const brief = await readBrief(db, briefId);
  if (!brief || brief.quiz.length === 0) return null;
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomQuizCode();
    // A code is unique among quizzes still running.
    const { count } = await admin
      .from("brief_quiz_sessions")
      .select("id", { count: "exact", head: true })
      .eq("code", code)
      .is("closed_at", null)
      .gt("expires_at", new Date().toISOString());
    if (count) continue;
    const { data, error } = await admin
      .from("brief_quiz_sessions")
      .insert({ brief_id: brief.id, course_id: brief.courseId, code, questions: brief.quiz, created_by: teacherId })
      .select("id")
      .single();
    if (error) throw new Error(`brief_quiz_sessions: ${error.message}`);
    return data.id;
  }
  throw new Error("brief_quiz_sessions: no free code");
}

/** The live results for the teacher: counts per option only. Null if the session isn't theirs. */
export async function teacherQuizView(db: Db, sessionId: string): Promise<TeacherQuizView | null> {
  const { data: session } = await db.from("brief_quiz_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session) return null;
  const admin = createAdminClient();
  const [responses, enrolled] = await Promise.all([
    admin.from("brief_quiz_responses").select("question_index, choice, student_id").eq("session_id", sessionId).limit(5000),
    admin.from("enrollments").select("student_id", { count: "exact", head: true }).eq("course_id", session.course_id),
  ]);
  if (responses.error) throw new Error(`brief_quiz_responses: ${responses.error.message}`);
  const questions = storedQuizSchema.safeParse(session.questions);
  const list = questions.success ? questions.data : [];
  const { results, participants } = tallyResponses(list, responses.data);
  return {
    id: session.id,
    briefId: session.brief_id,
    courseId: session.course_id,
    code: session.code,
    open: isQuizOpen({ closedAt: session.closed_at, expiresAt: session.expires_at }),
    createdAt: session.created_at,
    expiresAt: session.expires_at,
    questions: list,
    results,
    participants,
    enrolled: enrolled.count ?? 0,
  };
}

/** Closes a running quiz (students then see the answers). RLS read proves the teacher. */
export async function closeQuizSession(db: Db, sessionId: string) {
  const { data: session } = await db.from("brief_quiz_sessions").select("id, closed_at").eq("id", sessionId).maybeSingle();
  if (!session) return false;
  if (session.closed_at) return true;
  const { error } = await createAdminClient()
    .from("brief_quiz_sessions")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(`brief_quiz_sessions: ${error.message}`);
  return true;
}

/** Runs of this brief's quiz, newest first (teacher's client). */
export async function quizSessionsForBrief(db: Db, briefId: string) {
  const { data } = await db
    .from("brief_quiz_sessions")
    .select("id, code, created_at, closed_at, expires_at")
    .eq("brief_id", briefId)
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    createdAt: s.created_at,
    open: isQuizOpen({ closedAt: s.closed_at, expiresAt: s.expires_at }),
  }));
}

// ---------------------------------------------------------------- students

async function isEnrolled(db: Db, studentId: string, courseId: string) {
  const { data } = await db
    .from("enrollments")
    .select("course_id")
    .eq("course_id", courseId)
    .eq("student_id", studentId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * The running quiz with this code, if the student is enrolled in its course.
 * The service role finds the session (students can't read sessions); the
 * student's own client proves the enrollment.
 */
export async function findQuizByCode(db: Db, studentId: string, code: string) {
  const { data } = await createAdminClient()
    .from("brief_quiz_sessions")
    .select("id, course_id")
    .eq("code", code)
    .is("closed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { status: "not_found" as const };
  if (!(await isEnrolled(db, studentId, data.course_id))) return { status: "not_enrolled" as const };
  return { status: "ok" as const, sessionId: data.id };
}

export type StudentQuizView = {
  id: string;
  courseName: string;
  open: boolean;
  questions: StudentQuestion[];
  /** The student's own answers by question (null = not answered). */
  mine: (number | null)[];
};

export async function studentQuizView(db: Db, studentId: string, sessionId: string): Promise<StudentQuizView | null> {
  const { data: session } = await createAdminClient()
    .from("brief_quiz_sessions")
    .select("id, course_id, questions, closed_at, expires_at, course:courses(name, code)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || !(await isEnrolled(db, studentId, session.course_id))) return null;
  const parsed = storedQuizSchema.safeParse(session.questions);
  const questions = parsed.success ? parsed.data : [];
  const open = isQuizOpen({ closedAt: session.closed_at, expiresAt: session.expires_at });
  // RLS: the student reads only their own responses.
  const { data: own } = await db.from("brief_quiz_responses").select("question_index, choice").eq("session_id", sessionId);
  const mine = questions.map((_, i) => own?.find((r) => r.question_index === i)?.choice ?? null);
  return {
    id: session.id,
    courseName: session.course ? (session.course.code ? `${session.course.code} · ${session.course.name}` : session.course.name) : "Your course",
    open,
    questions: questionsForStudent(questions, open),
    mine,
  };
}

/** Saves (or changes) one answer while the quiz is open. */
export async function answerQuiz(db: Db, studentId: string, sessionId: string, index: number, choice: number) {
  const view = await studentQuizView(db, studentId, sessionId);
  if (!view) return "not_found" as const;
  if (!view.open) return "closed" as const;
  if (!view.questions[index] || choice >= view.questions[index].options.length) return "invalid" as const;
  const { error } = await createAdminClient()
    .from("brief_quiz_responses")
    .upsert(
      { session_id: sessionId, question_index: index, student_id: studentId, choice, updated_at: new Date().toISOString() },
      { onConflict: "session_id,question_index,student_id" },
    );
  if (error) throw new Error(`brief_quiz_responses: ${error.message}`);
  return "ok" as const;
}
