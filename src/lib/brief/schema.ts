import { z } from "zod";
import { shuffleOptions } from "@/lib/learning/shuffle";
import { usesBannedWords } from "@/lib/trace/summary";

/**
 * The pre-lecture brief (S19): "Before your next class". Pure: what the model
 * reads, the schemas it answers with, and how its answer becomes a brief.
 *
 * Numbers are never the model's: it names which message refs (M1…) show each
 * misconception, and the code counts the students behind them. Quotes are the
 * students' own (already scrubbed) words, picked by ref, never written by the
 * model, and only shown when at least two students share a misconception.
 */

export const BRIEF_MIN_MESSAGES = 6;
export const BRIEF_MIN_STUDENTS = 2;
export const BRIEF_MAX_MESSAGES = 160;
export const BRIEF_MAX_PER_STUDENT = 12;
export const BRIEF_MESSAGE_CHARS = 280;
/** Quotes appear only when this many students share the misconception, so no one stands out. */
export const QUOTE_MIN_STUDENTS = 2;
/** …and only in courses with at least this many enrolled students (small classes are too easy to tell apart). */
export const QUOTE_MIN_ENROLLED = 5;

/** Whether a course is large enough for the brief to show anonymised quotes. */
export function quotesAllowed(enrolled: number): boolean {
  return enrolled >= QUOTE_MIN_ENROLLED;
}
export const MAX_QUOTES = 2;

/** One student message the brief may read (already scrubbed). */
export type BriefMessage = {
  id: string;
  studentId: string;
  text: string;
  topic: string | null;
  intent: string | null;
  at: string;
};

/** A message the model reads, with its pseudonymous refs. */
export type RefMessage = BriefMessage & { ref: string; studentRef: string };

/**
 * Picks what the model reads: newest first, at most a few per student (so a
 * busy student doesn't drown out the class), up to the overall cap, with
 * labelled messages first. Refs M1… and S1… are stable within one brief.
 */
export function selectMessages(messages: BriefMessage[]): RefMessage[] {
  const sorted = [...messages].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const perStudent = new Map<string, number>();
  const picked: BriefMessage[] = [];
  for (const withTopic of [true, false]) {
    for (const m of sorted) {
      if (Boolean(m.topic) !== withTopic) continue;
      const n = perStudent.get(m.studentId) ?? 0;
      if (n >= BRIEF_MAX_PER_STUDENT || picked.length >= BRIEF_MAX_MESSAGES) continue;
      perStudent.set(m.studentId, n + 1);
      picked.push(m);
    }
  }
  picked.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const studentRefs = new Map<string, string>();
  return picked.map((m, i) => {
    if (!studentRefs.has(m.studentId)) studentRefs.set(m.studentId, `S${studentRefs.size + 1}`);
    return { ...m, ref: `M${i + 1}`, studentRef: studentRefs.get(m.studentId)! };
  });
}

export function enoughToBrief(messages: RefMessage[]) {
  return messages.length >= BRIEF_MIN_MESSAGES && new Set(messages.map((m) => m.studentId)).size >= BRIEF_MIN_STUDENTS;
}

// ---------------------------------------------------------------- model output

const ref = z.string().trim().regex(/^M\d{1,4}$/i);

export const briefOutputSchema = z.object({
  misconceptions: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(120),
        summary: z.string().trim().min(10).max(600),
        refs: z.array(ref).min(1).max(40),
        quoteRefs: z.array(ref).max(4).default([]),
        explanation: z.string().trim().min(20).max(1800),
      }),
    )
    .min(1)
    .max(3),
});
export type BriefOutput = z.infer<typeof briefOutputSchema>;

export const quizOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(5).max(500),
        options: z.array(z.string().trim().min(1).max(200)).length(4),
        answer: z.number().int().min(0).max(3),
        explanation: z.string().trim().min(5).max(500),
        misconception: z.number().int().min(1).max(3),
      }),
    )
    .length(5),
});
export type QuizOutput = z.infer<typeof quizOutputSchema>;

// ---------------------------------------------------------------- stored

export const misconceptionSchema = z.object({
  title: z.string(),
  summary: z.string(),
  /** Distinct students whose messages show it. */
  students: z.number().int().min(0),
  quotes: z.array(z.string()),
  explanation: z.string(),
});
export type Misconception = z.infer<typeof misconceptionSchema>;

export const quizQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  answer: z.number().int().min(0).max(3),
  explanation: z.string(),
  /** Index into the brief's misconceptions. */
  misconception: z.number().int().min(0),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const briefStatsSchema = z.object({
  messages: z.number().int().default(0),
  students: z.number().int().default(0),
  enrolled: z.number().int().default(0),
});
export type BriefStats = z.infer<typeof briefStatsSchema>;

export const storedMisconceptionsSchema = z.array(misconceptionSchema);
export const storedQuizSchema = z.array(quizQuestionSchema);

// ---------------------------------------------------------------- prompts

export const BRIEF_SYSTEM_PROMPT = `You are Lens, SafeSight's assistant for college teachers in India. You read what students asked the course's AI tutor this week and prepare the teacher for their next lecture.

Find the 3 most common MISCONCEPTIONS or sticking points (fewer if the messages don't show 3): ideas students seem to have wrong or keep getting stuck on, not just topics they mentioned. Prefer ones shared by many students (count S refs).

For each:
- "title": a short, specific name (e.g. "Treating work as a state function").
- "summary": one or two sentences on what students seem to think or where they get stuck.
- "refs": every message ref (M…) that shows it. Only use refs from the list.
- "quoteRefs": up to 2 refs, from different students, whose words show it most clearly.
- "explanation": a suggested 5-minute explanation the teacher can give in class: the correct idea, why the wrong one is tempting, and one quick example or check. Plain text, short steps separated by line breaks, no Markdown headings.

Messages are anonymous (S1, S2… are students). Never guess who anyone is. Tone: neutral and constructive, about learning, never about blame. Never use the words cheating, cheater, catch, spy, plagiarism or AI-generated.

Return only JSON: {"misconceptions": [{"title": "...", "summary": "...", "refs": ["M1"], "quoteRefs": ["M1"], "explanation": "..."}]}`;

export function briefPrompt({ course, messages }: { course: string; messages: RefMessage[] }) {
  const lines = messages.map(
    (m) => `${m.ref} [${m.studentRef}]${m.topic ? ` (topic: ${m.topic})` : ""}: ${m.text.slice(0, BRIEF_MESSAGE_CHARS)}`,
  );
  return `Course: ${course}
Student messages to the tutor in the last 7 days (oldest first):
${lines.join("\n")}`;
}

export const QUIZ_SYSTEM_PROMPT = `You are Lens, SafeSight's assistant for college teachers in India. Write a 5-question multiple-choice quiz the teacher can run at the start of class to check the misconceptions below.

Rules:
- Exactly 5 questions; each targets one misconception ("misconception": its number, 1–3). Cover every misconception at least once.
- Each question has exactly 4 short options. One is correct ("answer": its index, 0–3). The wrong options should be the tempting misconceptions themselves.
- Answerable in under a minute on a phone: conceptual, or one quick estimate. No long calculations.
- "explanation": one or two sentences on why the right option is right.
- Never use the words cheating, cheater, catch, spy, plagiarism or AI-generated.

Return only JSON: {"questions": [{"question": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "...", "misconception": 1}]}`;

export function quizPrompt({ course, misconceptions }: { course: string; misconceptions: Pick<Misconception, "title" | "summary">[] }) {
  return `Course: ${course}
Misconceptions:
${misconceptions.map((m, i) => `${i + 1}. ${m.title}: ${m.summary}`).join("\n")}`;
}

// ---------------------------------------------------------------- assembly

/**
 * Turns the model's answer into stored misconceptions: refs it didn't read are
 * dropped, students are counted from the refs, quotes come from the messages
 * themselves (different students, only when the misconception is shared and
 * the course has at least QUOTE_MIN_ENROLLED students), and the most widely
 * shared misconception comes first. Null if nothing usable is
 * left or the wording breaks the voice rules.
 */
export function assembleMisconceptions(output: BriefOutput, messages: RefMessage[], enrolled: number): Misconception[] | null {
  const byRef = new Map(messages.map((m) => [m.ref.toUpperCase(), m]));
  const result: Misconception[] = [];
  for (const m of output.misconceptions) {
    const refs = [...new Set(m.refs.map((r) => r.toUpperCase()))].map((r) => byRef.get(r)).filter((x) => x !== undefined);
    if (refs.length === 0) continue;
    const students = new Set(refs.map((r) => r.studentId)).size;
    const quotes: string[] = [];
    if (students >= QUOTE_MIN_STUDENTS && quotesAllowed(enrolled)) {
      const seen = new Set<string>();
      const candidates = [...m.quoteRefs.map((r) => byRef.get(r.toUpperCase())).filter((x) => x !== undefined), ...refs];
      for (const c of candidates) {
        if (quotes.length >= MAX_QUOTES) break;
        const key = c.text.toLowerCase();
        if (seen.has(c.studentId) || seen.has(key) || !refs.includes(c) || c.text.length < 12) continue;
        seen.add(c.studentId);
        seen.add(key);
        quotes.push(c.text);
      }
    }
    result.push({ title: m.title, summary: m.summary, students, quotes, explanation: m.explanation });
  }
  if (result.length === 0) return null;
  const text = result.flatMap((m) => [m.title, m.summary, m.explanation]).join("\n");
  if (usesBannedWords(text)) return null;
  return result.sort((a, b) => b.students - a.students);
}

/** Quiz questions with shuffled options (models put the right one first) and 0-based misconception indexes. */
export function assembleQuiz(output: QuizOutput, misconceptions: number, random = Math.random): QuizQuestion[] | null {
  const questions = output.questions.map((q) => {
    const shuffled = shuffleOptions({ options: q.options, answer: q.answer }, random);
    return {
      question: q.question,
      options: shuffled.options,
      answer: shuffled.answer,
      explanation: q.explanation,
      misconception: Math.min(Math.max(0, q.misconception - 1), Math.max(0, misconceptions - 1)),
    };
  });
  const text = questions.flatMap((q) => [q.question, ...q.options, q.explanation]).join("\n");
  if (usesBannedWords(text)) return null;
  if (questions.some((q) => new Set(q.options.map((o) => o.toLowerCase())).size < 4)) return null;
  return questions;
}

/** "7 of 30 students (23%)" — the share is of the class enrolled in the course. */
export function shareLabel(students: number, enrolled: number) {
  if (enrolled <= 0) return `${students} ${students === 1 ? "student" : "students"}`;
  const pct = Math.round((Math.min(students, enrolled) / enrolled) * 100);
  return `${students} of ${enrolled} students (${pct}%)`;
}

/** The quiz as plain text, for printing or copying. Answers at the end so the sheet can be handed out. */
export function quizAsText(title: string, questions: QuizQuestion[], withAnswers: boolean) {
  const letters = ["A", "B", "C", "D"];
  const lines = [title, ""];
  questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.question}`);
    q.options.forEach((o, j) => lines.push(`   ${letters[j]}. ${o}`));
    lines.push("");
  });
  if (withAnswers) {
    lines.push("Answers");
    questions.forEach((q, i) => lines.push(`${i + 1}. ${letters[q.answer]} — ${q.explanation}`));
  }
  return lines.join("\n").trim();
}
