import { z } from "zod";

/**
 * zod schemas for the learning tools: what the browser may send, and what
 * the model must return (structured JSON output).
 */

const topic = z
  .string()
  .trim()
  .min(2, "Pick a topic first.")
  .max(120, "That topic name is a bit long.");

// ------------------------------------------------------------- requests

export const practiceRequestSchema = z.object({
  courseId: z.uuid(),
  topic,
  kind: z.enum(["practice", "review", "refresher"]).default("practice"),
  source: z.enum(["explore", "learning", "sage"]).default("learning"),
});
export type PracticeRequest = z.infer<typeof practiceRequestSchema>;

export const answerRequestSchema = z
  .object({
    answer: z.string().trim().max(4000, "That answer is a bit long — try the key steps.").optional(),
    choice: z.number().int().min(0).max(5).optional(),
  })
  .refine((b) => (b.answer && b.answer.length > 0) || b.choice !== undefined, "Write an answer first.");

export const explainBackRequestSchema = z.object({
  courseId: z.uuid(),
  conversationId: z.uuid().nullable(),
  topic,
  explanation: z
    .string()
    .trim()
    .min(20, "Write a sentence or two in your own words first.")
    .max(3000, "That's long — try saying it in a few sentences."),
});

export const recapRequestSchema = z.object({
  conversationId: z.uuid(),
  reason: z.enum(["new_chat", "idle", "leave"]),
});

// ------------------------------------------------------------- model output

export const difficulties = ["warm_up", "standard", "stretch"] as const;

export const practiceOutputSchema = z.object({
  problems: z
    .array(
      z.object({
        difficulty: z.enum(difficulties),
        question: z.string().min(10).max(1500),
        solution: z.string().min(10).max(3000),
        finalAnswer: z.string().max(300),
        /** Review sets: which topic or mistake this problem practises. */
        topic: z.string().max(100).optional(),
      }),
    )
    .min(1)
    .max(5),
});
export type PracticeOutput = z.infer<typeof practiceOutputSchema>;

export const practiceJsonShape = `{
  "problems": [
    { "difficulty": "warm_up" | "standard" | "stretch", "question": string, "solution": string, "finalAnswer": string, "topic": string }
  ]  (exactly 3, in the order warm_up, standard, stretch)
}`;

export const gradeOutputSchema = z.object({
  verdict: z.enum(["correct", "partly", "not_yet"]),
  score: z.number().min(0).max(1),
  feedback: z.string().min(1).max(900),
  /** A short name for the error pattern, e.g. "sign of work done by the gas"; "" if none. */
  mistake: z.string().max(100),
});
export type GradeOutput = z.infer<typeof gradeOutputSchema>;

export const gradeJsonShape = `{
  "verdict": "correct" | "partly" | "not_yet",
  "score": number from 0 to 1,
  "feedback": string (2–4 short sentences, speaking to the student),
  "mistake": string (at most 8 words naming the error pattern, "" if none)
}`;

export const refresherOutputSchema = z.object({
  skill: z.string().min(2).max(100),
  lesson: z.string().min(40).max(2500),
  checks: z
    .array(
      z.object({
        question: z.string().min(5).max(600),
        options: z.array(z.string().min(1).max(200)).min(3).max(4),
        answer: z.number().int().min(0).max(3),
        explanation: z.string().min(5).max(600),
      }),
    )
    .min(2)
    .max(3),
});
export type RefresherOutput = z.infer<typeof refresherOutputSchema>;

export const refresherJsonShape = `{
  "skill": string (the basic skill, at most 8 words),
  "lesson": string (Markdown, 120–220 words),
  "checks": [
    { "question": string, "options": [string, string, string, string], "answer": 0 | 1 | 2 | 3, "explanation": string }
  ]  (exactly 2)
}`;

export const explainBackOutputSchema = z.object({
  score: z.number().min(0).max(1),
  feedback: z.string().min(1).max(900),
  gaps: z.array(z.string().max(160)).max(4),
});
export type ExplainBackOutput = z.infer<typeof explainBackOutputSchema>;

export const explainBackJsonShape = `{
  "score": number from 0 to 1,
  "feedback": string (2–4 short sentences, speaking to the student),
  "gaps": [string] (0–3 short phrases naming what's missing or muddled)
}`;

export const recapOutputSchema = z.object({
  title: z.string().min(2).max(100),
  learned: z.array(z.string().min(3).max(240)).min(1).max(6),
  flashcards: z
    .array(z.object({ front: z.string().min(2).max(240), back: z.string().min(1).max(360) }))
    .min(1)
    .max(5),
});
export type RecapOutput = z.infer<typeof recapOutputSchema>;

export const recapJsonShape = `{
  "title": string (at most 8 words),
  "learned": [string] (3–5 bullets, each one sentence),
  "flashcards": [{ "front": string, "back": string }] (exactly 3)
}`;

export const mistakeOutputSchema = z.object({
  found: z.boolean(),
  /** "M1", "M2", … from the student's existing patterns, or null for a new one. */
  sameAs: z.string().max(8).nullable(),
  pattern: z.string().max(100),
  topic: z.string().max(100),
});
export type MistakeOutput = z.infer<typeof mistakeOutputSchema>;

export const mistakeJsonShape = `{
  "found": boolean,
  "sameAs": "M1" | "M2" | … | null,
  "pattern": string (at most 8 words, e.g. "sign errors in entropy change"; "" if none),
  "topic": string (at most 6 words; "" if none)
}`;

/** A flashcard or a recap bullet as stored. */
export const flashcardsSchema = z.array(z.object({ front: z.string(), back: z.string() }));
export const learnedSchema = z.array(z.string());
export const optionsSchema = z.array(z.string());
