import { z } from "zod";
import { usesBannedWords } from "@/lib/trace/summary";

/**
 * "Check AI resilience" (S18): how easily a general chatbot could fully do an
 * assignment from its instructions alone, with reasons and three rewrites the
 * teacher can apply with one click. Pure: schemas, prompt and checks.
 */

export const resilienceRequestSchema = z.object({
  courseId: z.uuid(),
  title: z.string().trim().min(2, "Give the assignment a title first.").max(200),
  instructions: z
    .string()
    .trim()
    .min(20, "Write the instructions first (at least a sentence), then check them.")
    .max(10_000, "Keep the instructions under 10,000 characters."),
  aiMode: z.enum(["learn", "assist", "exam"]),
});
export type ResilienceRequest = z.infer<typeof resilienceRequestSchema>;

export const rewriteApproaches = ["reasoning", "local", "oral"] as const;
export type RewriteApproach = (typeof rewriteApproaches)[number];

export const approachLabels: Record<RewriteApproach, string> = {
  reasoning: "Show the reasoning",
  local: "Local or personal data",
  oral: "Short oral or in-class step",
};

export const resilienceSchema = z.object({
  /** 0 = a chatbot couldn't do it alone, 100 = it could do the whole thing. */
  score: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(300),
  reasons: z.array(z.string().trim().min(1).max(300)).min(1).max(4),
  rewrites: z
    .array(
      z.object({
        approach: z.enum(rewriteApproaches),
        title: z.string().trim().min(1).max(100),
        why: z.string().trim().min(1).max(300),
        instructions: z.string().trim().min(20).max(6_000),
      }),
    )
    .length(3),
});
export type Resilience = z.infer<typeof resilienceSchema>;

/** Order rewrites as reasoning → local → oral, and reject a result that repeats an approach or uses banned words. */
export function cleanResilience(r: Resilience): Resilience | null {
  const approaches = new Set(r.rewrites.map((w) => w.approach));
  if (approaches.size !== 3) return null;
  const text = [r.summary, ...r.reasons, ...r.rewrites.flatMap((w) => [w.title, w.why, w.instructions])].join("\n");
  if (usesBannedWords(text)) return null;
  const order = (a: RewriteApproach) => rewriteApproaches.indexOf(a);
  return { ...r, rewrites: [...r.rewrites].sort((a, b) => order(a.approach) - order(b.approach)) };
}

/** Score bands for the label next to the number. */
export function resilienceBand(score: number): { label: string; tone: "good" | "warning" | "critical" } {
  if (score < 40) return { label: "Hard for a chatbot to do alone", tone: "good" };
  if (score < 70) return { label: "A chatbot could do much of it", tone: "warning" };
  return { label: "A chatbot could do all of it", tone: "critical" };
}

export const RESILIENCE_SYSTEM_PROMPT = `You review assignments for college teachers in India. Judge how easily a general AI chatbot (ChatGPT, Gemini, Claude and similar) could fully complete the assignment from its instructions alone, so that a student could submit the chatbot's output without learning anything.

Score from 0 to 100:
- 80–100: a chatbot can produce a complete, submittable answer from the text alone (standard textbook problems, generic essays, common code exercises).
- 40–79: a chatbot can do much of it, but some part needs the student's own data, choices, or presence.
- 0–39: the work depends on things a chatbot can't have: the student's own measurements or observations, local or personal context, in-class or oral steps, or reasoning they must show and defend.

Give 2–4 short, specific reasons that refer to this assignment's own wording.

Then write exactly three rewrites of the full instructions, one for each approach:
- "reasoning": students must show and justify their working or choices (e.g. explain why each step, compare two methods, state assumptions and check them).
- "local": the work uses local or personal data a chatbot doesn't have (the student's own lab readings, their hostel, town, college or family context, numbers they measure themselves).
- "oral": add a short oral or in-class step (e.g. a 3-minute explanation to the teacher, a step done in the lab or tutorial, a quick viva on their own submission).

Rules for rewrites:
- Keep the subject, level and learning goals. Keep it about the same length, plus what the new step needs.
- Write the complete instructions, ready to paste for students, in plain English, addressed to the student.
- Be encouraging. Never mention detection, rules being broken, or suspicion. Never use the words cheating, cheater, catch, spy or AI-generated.
- Don't add answers or solutions.

Return only JSON: {"score": 0-100, "summary": "one sentence", "reasons": ["..."], "rewrites": [{"approach": "reasoning" | "local" | "oral", "title": "short name", "why": "one sentence on why it is harder for a chatbot", "instructions": "the full rewritten instructions"}]}`;

export function resiliencePrompt(r: ResilienceRequest, course: { name: string; code: string }) {
  const mode = { learn: "Learn (Sage gives hints only)", assist: "Assist (Sage explains, never writes the work)", exam: "Exam (Sage is off)" }[
    r.aiMode
  ];
  return `Course: ${course.code ? `${course.code} ` : ""}${course.name}
SafeSight AI mode: ${mode}
Title: ${r.title}

Instructions:
"""
${r.instructions}
"""`;
}
