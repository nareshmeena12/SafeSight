import { z } from "zod";
import { usesBannedWords } from "@/lib/trace/summary";

/**
 * "Draft feedback" on a submission (S19). Pure: reading the assignment's
 * rubric, the schemas, the prompt and the checks. The teacher edits and
 * approves every draft; nothing reaches the student before that.
 */

export const MAX_CRITERIA = 8;

export type RubricCriterion = { criterion: string; description: string; maxPoints: number | null };

/** Used when the assignment has no rubric (the card says so). */
export const DEFAULT_RUBRIC: RubricCriterion[] = [
  { criterion: "Understanding", description: "The key ideas are correct and used for the right reasons.", maxPoints: null },
  { criterion: "Reasoning and working", description: "Steps are shown, follow from each other and are checked.", maxPoints: null },
  { criterion: "Clarity", description: "The answer is organised and easy to follow, with units and terms used correctly.", maxPoints: null },
];

const POINTS = /\s*[([]\s*(\d{1,3})\s*(?:marks?|pts?|points?)?\s*[)\]]\s*|\s+[-–—]\s*(\d{1,3})\s*(?:marks?|pts?|points?)\b/i;

/**
 * One criterion per line: "Criterion (10): what it looks for", "Criterion —
 * description", "Criterion [5 marks]" or just "Criterion". Bullets and
 * numbering are ignored; at most 8 criteria.
 */
export function parseRubric(text: string): RubricCriterion[] {
  const out: RubricCriterion[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s*/, "").trim();
    if (!line) continue;
    let maxPoints: number | null = null;
    const points = POINTS.exec(line);
    if (points) {
      maxPoints = Number(points[1] ?? points[2]);
      line = `${line.slice(0, points.index)} ${line.slice(points.index + points[0].length)}`.replace(/\s+/g, " ").trim();
    }
    const split = /\s*(?::|\s[-–—]\s)\s*/.exec(line);
    const criterion = (split ? line.slice(0, split.index) : line).replace(/[:\-–—\s]+$/, "").trim();
    const description = split ? line.slice(split.index + split[0].length).trim() : "";
    if (!criterion) continue;
    out.push({ criterion: criterion.slice(0, 120), description: description.slice(0, 400), maxPoints: maxPoints && maxPoints > 0 ? maxPoints : null });
    if (out.length >= MAX_CRITERIA) break;
  }
  return out;
}

// ---------------------------------------------------------------- model output

export const feedbackOutputSchema = z.object({
  criteria: z
    .array(
      z.object({
        points: z.number().min(0).max(1000).nullable().optional(),
        comment: z.string().trim().min(10).max(900),
      }),
    )
    .min(1)
    .max(MAX_CRITERIA),
  overall: z.string().trim().min(10).max(1200),
});
export type FeedbackOutput = z.infer<typeof feedbackOutputSchema>;

// ---------------------------------------------------------------- stored / edited

export const feedbackCriterionSchema = z.object({
  criterion: z.string().trim().min(1, "Name each criterion.").max(120),
  description: z.string().trim().max(400).default(""),
  maxPoints: z.number().min(0).max(1000).nullable().default(null),
  points: z.number().min(0).max(1000).nullable().default(null),
  comment: z.string().trim().max(2000, "Keep each comment under 2,000 characters.").default(""),
});
export type FeedbackCriterion = z.infer<typeof feedbackCriterionSchema>;

export const storedCriteriaSchema = z.array(feedbackCriterionSchema);

export const feedbackStatusSchema = z.enum(["draft", "approved"]);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

export type Feedback = {
  criteria: FeedbackCriterion[];
  overall: string;
  status: FeedbackStatus;
  approvedAt: string | null;
  updatedAt: string;
  /** True when the assignment had no rubric and the general criteria were used. */
  generalCriteria?: boolean;
};

export const draftFeedbackSchema = z.object({ submissionId: z.uuid() });

export const saveFeedbackSchema = z
  .object({
    submissionId: z.uuid(),
    criteria: z.array(feedbackCriterionSchema).min(1).max(MAX_CRITERIA),
    overall: z.string().trim().max(4000, "Keep the overall comment under 4,000 characters.").default(""),
    status: feedbackStatusSchema,
  })
  .superRefine((v, ctx) => {
    v.criteria.forEach((c, i) => {
      if (c.points !== null && c.maxPoints !== null && c.points > c.maxPoints) {
        ctx.addIssue({ code: "custom", path: ["criteria", i, "points"], message: `At most ${c.maxPoints} for ${c.criterion}.` });
      }
    });
    if (v.status === "approved" && !v.overall && v.criteria.every((c) => !c.comment)) {
      ctx.addIssue({ code: "custom", path: ["overall"], message: "Write some feedback before sharing it." });
    }
  });
export type SaveFeedback = z.infer<typeof saveFeedbackSchema>;

// ---------------------------------------------------------------- prompt

export const FEEDBACK_SYSTEM_PROMPT = `You are Lens, SafeSight's assistant for college teachers in India. Draft feedback on one student's submitted work, criterion by criterion, for the teacher to edit and approve before the student sees it.

For each rubric criterion, in the same order:
- "comment": 2–4 sentences written to the student ("you"): one specific strength from their work, then the most useful next step, pointing at their own text (a step, claim, value or paragraph). Concrete, warm and plain.
- "points": a suggested mark only if the criterion has a maximum; otherwise null. Never above the maximum.
Then "overall": 2–3 sentences: what the work does well overall and the one thing to focus on next time.

Rules: judge only the work as written against the rubric and the assignment. Don't rewrite the work or give a full model answer. Don't mention how the work was written, typing, pasting or time. Never use the words cheating, cheater, catch, spy, plagiarism, suspicious, dishonest or AI-generated.

Return only JSON: {"criteria": [{"points": 7, "comment": "..."}], "overall": "..."}`;

export function feedbackPrompt({
  title,
  instructions,
  rubric,
  answerKey,
  text,
}: {
  title: string;
  instructions: string;
  rubric: RubricCriterion[];
  answerKey: string;
  text: string;
}) {
  const criteria = rubric
    .map((c, i) => `${i + 1}. ${c.criterion}${c.maxPoints !== null ? ` (out of ${c.maxPoints})` : " (no marks)"}${c.description ? `: ${c.description}` : ""}`)
    .join("\n");
  return `Assignment: ${title}
${instructions ? `Instructions:\n"""\n${instructions.slice(0, 3000)}\n"""\n` : ""}${
    answerKey ? `Teacher's private answer key (to judge correctness; don't copy it into the feedback):\n"""\n${answerKey.slice(0, 3000)}\n"""\n` : ""
  }Rubric (${rubric.length} criteria):
${criteria}

The student's submitted work:
"""
${text}
"""`;
}

/**
 * The model's answer as editable criteria, or null when it doesn't fit the
 * rubric or breaks the wording rules. Points are clamped to each maximum and
 * dropped where the criterion has none.
 */
export function assembleFeedback(output: FeedbackOutput, rubric: RubricCriterion[]): { criteria: FeedbackCriterion[]; overall: string } | null {
  if (output.criteria.length !== rubric.length) return null;
  const criteria = rubric.map((c, i) => {
    const o = output.criteria[i];
    const points = c.maxPoints === null || o.points === null || o.points === undefined ? null : Math.min(c.maxPoints, Math.max(0, Math.round(o.points * 2) / 2));
    return { criterion: c.criterion, description: c.description, maxPoints: c.maxPoints, points, comment: o.comment };
  });
  const text = [...criteria.map((c) => c.comment), output.overall].join("\n");
  if (usesBannedWords(text)) return null;
  return { criteria, overall: output.overall };
}

/** "17 / 25" when every criterion with a maximum has points. */
export function totalPoints(criteria: Pick<FeedbackCriterion, "points" | "maxPoints">[]) {
  const scored = criteria.filter((c) => c.maxPoints !== null);
  if (scored.length === 0 || scored.some((c) => c.points === null)) return null;
  return {
    points: scored.reduce((s, c) => s + (c.points ?? 0), 0),
    max: scored.reduce((s, c) => s + (c.maxPoints ?? 0), 0),
  };
}
