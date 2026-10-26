import { z } from "zod";
import { MAX_PLAN_DAYS } from "./plan";

/**
 * zod schemas for exam prep: what the browser may send, what the model must
 * return (structured JSON), and the shapes stored in jsonb columns.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

// ------------------------------------------------------------- requests

export const planRequestSchema = z.object({
  courseId: z.uuid(),
  examDate: isoDate,
  minutesPerDay: z.coerce.number().int().min(15).max(240),
});

export const planPatchSchema = z.union([
  z.object({ taskId: z.string().max(40), done: z.boolean() }),
  z.object({ topicKey: z.string().max(120), checked: z.boolean() }),
  z.object({ rebuild: z.literal(true) }),
]);

export const mockRequestSchema = z.object({
  planId: z.uuid(),
  size: z.enum(["short", "full"]),
});

export const mockAnswerSchema = z
  .object({
    answer: z.string().max(4000, "That answer is a bit long — try the key steps.").optional(),
    choice: z.number().int().min(0).max(5).nullable().optional(),
  })
  .refine((b) => b.answer !== undefined || b.choice !== undefined, "Nothing to save.");

/** The teacher's exam info form. */
export const examInfoSchema = z.object({
  courseId: z.uuid(),
  topics: z.string().max(8000, "That's a long syllabus — keep it to the topic names."),
  pattern: z.string().trim().max(2000, "Keep the exam pattern under 2,000 characters."),
  examDate: z.union([z.literal(""), isoDate]),
});

/** A plan's date range, checked against today on the server. */
export function examDateProblem(examDate: string, today: string): string | null {
  if (examDate <= today) return "Pick a date after today.";
  const days = (Date.parse(`${examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  if (days > MAX_PLAN_DAYS) return `Pick a date within the next ${MAX_PLAN_DAYS} days — plan again closer to the exam.`;
  return null;
}

// ------------------------------------------------------------- stored jsonb

const noteRef = z.object({ materialId: z.string(), title: z.string(), page: z.number().nullable() });

export const planTopicsSchema = z.array(
  z.object({
    key: z.string(),
    title: z.string(),
    unit: z.string().nullable(),
    source: z.enum(["syllabus", "notes", "yours"]),
    weight: z.number(),
    mastery: z.number().nullable(),
    evidence: z.number(),
    mistakes: z.number(),
    asked: z.number(),
    reasons: z.array(z.string()),
    notes: z.array(noteRef),
  }),
);

export const planDaysSchema = z.array(
  z.object({
    date: z.string(),
    kind: z.enum(["study", "light", "mock"]),
    tasks: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["learn", "practice", "revisit", "review", "mock", "recap"]),
        topic: z.string().nullable(),
        key: z.string().nullable(),
        minutes: z.number(),
        title: z.string(),
      }),
    ),
  }),
);

export const planSourcesSchema = z.object({
  syllabus: z.boolean().default(false),
  notes: z.boolean().default(false),
  pattern: z.string().default(""),
  skipped: z.array(z.string()).default([]),
});

export const syllabusTopicsSchema = z.array(z.object({ title: z.string(), unit: z.string().nullable().default(null) }));

export const noteTopicsSchema = z.array(z.object({ title: z.string(), materialId: z.string(), page: z.number().nullable() }));

// ------------------------------------------------------------- model output

export const noteTopicsOutputSchema = z.object({
  topics: z
    .array(z.object({ title: z.string().min(2).max(100), ref: z.string().max(8) }))
    .min(1)
    .max(20),
});
export const noteTopicsJsonShape = `{
  "topics": [ { "title": string (2–6 words), "ref": "P1" | "P2" | … (the excerpt where it is taught) } ]  (6–14 topics, in teaching order)
}`;

export const mockConceptualOutputSchema = z.object({
  choice: z
    .array(
      z.object({
        topic: z.string().max(120),
        question: z.string().min(10).max(1200),
        options: z.array(z.string().min(1).max(300)).length(4),
        answer: z.number().int().min(0).max(3),
        explanation: z.string().min(5).max(900),
      }),
    )
    .max(8),
  open: z
    .array(
      z.object({
        topic: z.string().max(120),
        question: z.string().min(10).max(1500),
        solution: z.string().min(10).max(3000),
        finalAnswer: z.string().max(300),
      }),
    )
    .max(4),
});
export type MockConceptualOutput = z.infer<typeof mockConceptualOutputSchema>;

export const mockNumericOutputSchema = z.object({
  problems: z
    .array(
      z.object({
        topic: z.string().max(120),
        question: z.string().min(10).max(1500),
        solution: z.string().min(10).max(3000),
        finalAnswer: z.string().min(1).max(300),
      }),
    )
    .min(1)
    .max(6),
});
export type MockNumericOutput = z.infer<typeof mockNumericOutputSchema>;

export function mockConceptualJsonShape(choice: number, open: number) {
  return `{
  "choice": [ { "topic": string, "question": string, "options": [string, string, string, string], "answer": 0 | 1 | 2 | 3, "explanation": string } ]  (exactly ${choice}),
  "open": [ { "topic": string, "question": string, "solution": string, "finalAnswer": string } ]  (exactly ${open})
}`;
}

export function mockNumericJsonShape(count: number) {
  return `{
  "problems": [ { "topic": string, "question": string, "solution": string, "finalAnswer": string (the value with units) } ]  (exactly ${count})
}`;
}

export const mockGradeOutputSchema = z.object({
  results: z
    .array(
      z.object({
        ref: z.string().max(8),
        verdict: z.enum(["correct", "partly", "not_yet"]),
        score: z.number().min(0).max(1),
        feedback: z.string().min(1).max(900),
        mistake: z.string().max(100),
      }),
    )
    .max(20),
});
export const mockGradeJsonShape = `{
  "results": [ { "ref": "Q1" | "Q2" | …, "verdict": "correct" | "partly" | "not_yet", "score": number from 0 to 1, "feedback": string (1–3 short sentences to the student), "mistake": string (at most 8 words naming the error pattern, "" if none) } ]  (one per question given)
}`;
