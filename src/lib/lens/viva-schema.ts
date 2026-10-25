import { z } from "zod";
import { decodeEntities, PASTE_ATTR } from "@/lib/trace/html";
import { usesBannedWords } from "@/lib/trace/summary";

/**
 * "Suggest viva questions" (S18): Lens suggests three short questions a
 * teacher can ask a student about their own submitted work, and what a good
 * answer would show. Pure: schemas, the text Lens reads, prompt and checks.
 */

export const vivaQuestionSchema = z.object({
  question: z.string().trim().min(5).max(400),
  lookFor: z.string().trim().min(5).max(500),
});

export const vivaOutputSchema = z.object({ questions: z.array(vivaQuestionSchema).length(3) });
export type VivaOutput = z.infer<typeof vivaOutputSchema>;

/** As stored in viva_questions.questions. */
export const storedVivaSchema = z.array(vivaQuestionSchema.extend({ discussedAt: z.string().nullable().default(null) }));
export type VivaQuestion = z.infer<typeof storedVivaSchema>[number];

export const vivaRequestSchema = z.object({ submissionId: z.uuid() });
export const vivaMarkSchema = z.object({
  submissionId: z.uuid(),
  index: z.number().int().min(0).max(2),
  discussed: z.boolean(),
});

export const MAX_VIVA_TEXT = 8_000;

/**
 * The submission as plain text for Lens, with pasted passages wrapped in
 * [pasted]…[/pasted] so questions can focus on them. Paragraph-level tags
 * become line breaks; everything else is dropped.
 */
export function markedText(html: string, max = MAX_VIVA_TEXT): string {
  let out = "";
  const spans: boolean[] = [];
  let depth = 0;
  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  let last = 0;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    out += decodeEntities(html.slice(last, m.index));
    last = tag.lastIndex;
    const [, closing, rawName, attrs] = m;
    const name = rawName.toLowerCase();
    if (["p", "li", "h1", "h2", "h3", "h4", "blockquote", "pre", "br"].includes(name) && (closing || name === "br")) out += "\n";
    if (name !== "span" || attrs.trimEnd().endsWith("/")) continue;
    if (closing) {
      if (spans.pop()) {
        depth--;
        if (depth === 0) out += "[/pasted]";
      }
    } else {
      const isPaste = attrs.includes(PASTE_ATTR);
      spans.push(isPaste);
      if (isPaste) {
        if (depth === 0) out += "[pasted]";
        depth++;
      }
    }
  }
  out += decodeEntities(html.slice(last));
  const text = out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > max ? `${text.slice(0, max)}\n[…the rest is cut for length]` : text;
}

export type VivaEvidence = { reasons: string[]; strong: boolean };

/**
 * Whether the Trace evidence makes a short conversation worth suggesting:
 * a large share pasted, one large paste, or a long text written in very
 * little active time. Neutral reasons, for the card's intro.
 */
export function vivaEvidence({
  pasteRatio,
  activeMinutes,
  finalChars,
  pasteSizes,
}: {
  pasteRatio: number | null;
  activeMinutes: number | null;
  finalChars: number;
  pasteSizes: number[];
}): VivaEvidence {
  const reasons: string[] = [];
  if (pasteRatio !== null && pasteRatio >= 0.2) reasons.push(`about ${Math.round(pasteRatio * 100)}% of the final text was pasted`);
  const largest = pasteSizes.length ? Math.max(...pasteSizes) : 0;
  if (finalChars > 0 && largest / finalChars >= 0.15 && !(pasteRatio !== null && pasteRatio >= 0.2)) {
    reasons.push(`one paste was about ${Math.round(Math.min(1, largest / finalChars) * 100)}% of the final length`);
  }
  if (activeMinutes !== null && finalChars >= 1500 && activeMinutes < finalChars / 600) {
    reasons.push(`${finalChars.toLocaleString("en-IN")} characters were written in ${Math.max(1, Math.round(activeMinutes))} active minutes`);
  }
  return { reasons, strong: reasons.length > 0 };
}

export const VIVA_SYSTEM_PROMPT = `You are Lens, SafeSight's assistant for college teachers in India. A teacher wants a short, friendly conversation (a viva) with a student about the student's own submitted work, to hear them explain it in their own words.

Write exactly 3 questions:
- Short (one sentence, under 30 words), specific to this submission: name its own claims, steps, numbers or examples.
- If parts are marked [pasted]…[/pasted], at least two questions should be about those parts.
- Ask the student to explain, justify, extend or apply what they wrote (why this step, what would change if…, how they got this value). Not trivia, not yes/no.
- For each, "lookFor": one or two sentences on what a good answer would show (the idea, reasoning or step the student should be able to explain). Don't write a model answer.

Tone: neutral and encouraging. These are questions about understanding, never an accusation. Never suggest the student did anything wrong, never guess where text came from, and never use the words cheating, cheater, catch, spy, plagiarism or AI-generated.

Return only JSON: {"questions": [{"question": "...", "lookFor": "..."}]}`;

export function vivaPrompt({
  title,
  instructions,
  summary,
  text,
}: {
  title: string;
  instructions: string;
  summary: string | null;
  text: string;
}) {
  return `Assignment: ${title}
${instructions ? `Instructions:\n"""\n${instructions.slice(0, 3000)}\n"""\n` : ""}${summary ? `Trace evidence summary: ${summary}\n` : ""}
The student's submitted work:
"""
${text}
"""`;
}

/** Null when the output breaks the wording rules (the caller tries once more). */
export function cleanViva(output: VivaOutput): VivaOutput | null {
  const all = output.questions.flatMap((q) => [q.question, q.lookFor]).join("\n");
  return usesBannedWords(all) ? null : output;
}

/** All three as plain text, for "Copy". */
export function vivaAsText(title: string, questions: Pick<VivaQuestion, "question" | "lookFor">[]) {
  return [
    `Questions to talk through: ${title}`,
    "",
    ...questions.flatMap((q, i) => [`${i + 1}. ${q.question}`, `   A good answer shows: ${q.lookFor}`, ""]),
  ]
    .join("\n")
    .trim();
}
