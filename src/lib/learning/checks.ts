import { numbersIn, protectedNumbers } from "@/lib/sage/guard";
import { lexicalSimilarity, MATCH_THRESHOLD, type SageAssignment } from "@/lib/sage/match";
import { usesBannedWords } from "@/lib/trace/summary";

/**
 * Practice is never linked to graded work. Every generated problem, solution,
 * recap and flashcard passes these checks before a student sees it. Pure.
 */

type Graded = Pick<SageAssignment, "title" | "instructions" | "answerKey" | "mode">;

export type ContentCheck = { ok: true } | { ok: false; reason: string };

/**
 * A practice problem (with its worked solution) must not be an active
 * assignment's task, a part of it, or reveal a value from its private
 * answer key.
 */
export function checkPracticeItem(item: { question: string; solution: string }, assignments: Graded[]): ContentCheck {
  for (const a of assignments) {
    const similarity = Math.max(lexicalSimilarity(item.question, a), lexicalSimilarity(`${item.question}\n${item.solution}`, a));
    if (similarity >= MATCH_THRESHOLD) return { ok: false, reason: `Too close to "${a.title}".` };
    if (a.answerKey.trim()) {
      const keyValues = protectedNumbers([a.answerKey], `${a.title}\n${a.instructions}`);
      const hit = numbersIn(`${item.question}\n${item.solution}`).find((n) => keyValues.some((k) => near(k, n)));
      if (hit !== undefined) return { ok: false, reason: `Uses ${hit}, a value from "${a.title}".` };
    }
  }
  if (usesBannedWords(`${item.question}\n${item.solution}`)) return { ok: false, reason: "Wording we never use." };
  return { ok: true };
}

/**
 * A recap or flashcard only restates what the chat covered: no numbers that
 * weren't in the chat, and nothing from a private answer key.
 */
export function checkRecapText(text: string, chatText: string, answerKeys: string[]): ContentCheck {
  const seen = numbersIn(chatText);
  const fresh = numbersIn(text).filter((n) => !(Math.abs(n) < 10 && Number.isInteger(n)) && !seen.some((s) => near(s, n)));
  if (fresh.length) return { ok: false, reason: `Adds ${fresh[0]}, which wasn't in the chat.` };
  const keyValues = protectedNumbers(answerKeys, "");
  const hit = numbersIn(text).find((n) => keyValues.some((k) => near(k, n)) && !seen.some((s) => near(s, n)));
  if (hit !== undefined) return { ok: false, reason: `Uses ${hit} from a private answer key.` };
  if (/```/.test(text)) return { ok: false, reason: "Contains code." };
  if (usesBannedWords(text)) return { ok: false, reason: "Wording we never use." };
  return { ok: true };
}

/** Feedback on an explanation or a practice answer: no answer-key values and none of the banned words. */
export function checkFeedback(text: string, visibleText: string, answerKeys: string[]): ContentCheck {
  const keyValues = protectedNumbers(answerKeys, visibleText);
  const hit = numbersIn(text).find((n) => keyValues.some((k) => near(k, n)));
  if (hit !== undefined) return { ok: false, reason: `Uses ${hit} from a private answer key.` };
  if (usesBannedWords(text)) return { ok: false, reason: "Wording we never use." };
  return { ok: true };
}

function near(a: number, b: number) {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale > 0 && Math.abs(a - b) / scale <= 0.006;
}
