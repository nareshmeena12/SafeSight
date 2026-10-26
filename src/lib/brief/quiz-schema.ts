import { z } from "zod";
import type { QuizQuestion } from "./schema";

/**
 * The live in-class quiz (S19). Pure: codes, inputs, what students see and the
 * counts the teacher sees.
 */

export const quizCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Type the 6-digit code from the screen."));

export const startQuizSchema = z.object({ briefId: z.uuid() });
export const quizSessionIdSchema = z.uuid();
export const answerQuizSchema = z.object({
  sessionId: z.uuid(),
  index: z.number().int().min(0).max(9),
  choice: z.number().int().min(0).max(3),
});

/** A random 6-digit code; the first digit is never 0 so it reads as six digits. */
export function randomQuizCode(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(4))) {
  const n = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(100_000 + (n % 900_000));
}

export type SessionTimes = { closedAt: string | null; expiresAt: string };

export function isQuizOpen(s: SessionTimes, now = new Date()) {
  return !s.closedAt && new Date(s.expiresAt).getTime() > now.getTime();
}

/** What a student's phone gets: no answers while the quiz is open. */
export type StudentQuestion = { question: string; options: string[]; answer?: number; explanation?: string };

export function questionsForStudent(questions: QuizQuestion[], open: boolean): StudentQuestion[] {
  return questions.map((q) =>
    open
      ? { question: q.question, options: q.options }
      : { question: q.question, options: q.options, answer: q.answer, explanation: q.explanation },
  );
}

export type QuestionResult = { counts: number[]; answered: number };

/** Counts per option for each question; the teacher never sees who chose what. */
export function tallyResponses(
  questions: Pick<QuizQuestion, "options">[],
  responses: { question_index: number; choice: number; student_id: string }[],
): { results: QuestionResult[]; participants: number } {
  const results = questions.map((q) => ({ counts: q.options.map(() => 0), answered: 0 }));
  for (const r of responses) {
    const result = results[r.question_index];
    if (!result || r.choice < 0 || r.choice >= result.counts.length) continue;
    result.counts[r.choice] += 1;
    result.answered += 1;
  }
  return { results, participants: new Set(responses.map((r) => r.student_id)).size };
}
