import { z } from "zod";
import { significantNumbers } from "./match";
import type { Policy } from "./policy";

/**
 * Sage's output guard, part 1: deterministic checks that run on every draft
 * (and on every sentence of a streamed reply). Pure and fast. Part 2 is a
 * second, cheap model call (guard-model.ts) for drafts under an assignment's
 * rules. A failed check means: regenerate once with stricter rules, then fall
 * back to a safe hint.
 */

export const guardCategories = [
  "none",
  "final_answer",
  "answer_key_match",
  "submittable_text",
  "full_code",
  "bare_verdict",
  "prompt_leak",
  "same_problem_example",
] as const;
export type GuardCategory = (typeof guardCategories)[number];

export type GuardResult = { ok: true } | { ok: false; category: GuardCategory; reason: string };

export type GuardContext = {
  policy: Pick<Policy, "kind" | "governing">;
  /** Private answer keys to protect: the governing assignment's, or every active one in Explore. */
  answerKeys: string[];
  /** Private teacher notes that must never be quoted. */
  teacherNotes: string[];
  /** The full system prompt (for prompt-leak checks). */
  systemPrompt: string;
  /** Text the student can already see or wrote: assignment instructions, their own messages, note passages. */
  visibleText: string;
  /** Function names the code assignment asks for, e.g. ["newton_raphson"]. */
  codeNames?: string[];
  /** What the chat's own assignment hands in: its deliverable checks apply to every reply in that chat. */
  homeKind?: "problem" | "essay" | "code" | null;
};

const ok: GuardResult = { ok: true };
const fail = (category: GuardCategory, reason: string): GuardResult => ({ ok: false, category, reason });

function toWords(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+(?:['.][\p{L}\p{N}]+)*/gu) ?? [];
}

function shingleSet(text: string, n: number) {
  const ws = toWords(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(" "));
  return out;
}

/** Every number in a text, as values. */
export function numbersIn(text: string): number[] {
  return [...text.replace(/(\d),(\d{3})\b/g, "$1$2").matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g)]
    .map((m) => Number(m[0]))
    .filter((n) => Number.isFinite(n));
}

function sameValue(a: number, b: number) {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale > 0 && Math.abs(a - b) / scale <= 0.006;
}

/** Answer-key values the student hasn't seen: numbers in the key that aren't given in the question or by the student. */
export function protectedNumbers(answerKeys: string[], visibleText: string, distinctiveOnly = false): number[] {
  const visible = numbersIn(visibleText);
  const out: number[] = [];
  for (const key of answerKeys) {
    for (const s of significantNumbers(key)) {
      const n = Number(s);
      if (Math.abs(n) < 10 && Number.isInteger(n)) continue;
      if (distinctiveOnly && isRound(n)) continue;
      if (visible.some((v) => sameValue(v, n))) continue;
      if (!out.some((o) => sameValue(o, n))) out.push(n);
    }
  }
  return out;
}

/** One significant digit (300, 600, 1000): common in any example, so it says nothing on its own. */
function isRound(n: number) {
  return Number.isInteger(n) && /^-?[1-9]0*$/.test(String(n));
}

function proseParagraphs(text: string) {
  const noCode = text.replace(/```[\s\S]*?```/g, "\n\n");
  return noCode
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(\s*([-*+]|\d+[.)])\s)/m.test(p) && !p.startsWith(">") && !p.startsWith("|") && !p.startsWith("$$"))
    .map((p) => p.split(/\s+/).length);
}

function codeLines(text: string) {
  // A block still being streamed (no closing fence yet) counts too.
  return [...text.matchAll(/```[^\n]*\n([\s\S]*?)(?:```|$)/g)]
    .map((m) => m[1].split("\n").filter((l) => l.trim() && !/^\s*(#|\/\/)/.test(l)).length)
    .reduce((a, b) => a + b, 0);
}

const verdict =
  /\b((that'?s|this is|it'?s|you'?re|you are|your (final )?answer is|answer is|is)\s+(absolutely |exactly |perfectly |not |almost |very )?(correct|right|wrong|incorrect|off|close|spot[- ]on|accurate)|not quite|spot[- ]on|well done|nailed it|good job|great job|that'?s it\b)|[✓✔✗✘❌✅]/i;

/** Deterministic checks for one draft (or the streamed text so far). */
export function deterministicGuard(draft: string, ctx: GuardContext): GuardResult {
  const text = draft.trim();
  if (!text) return ok;
  const kind = ctx.policy.kind;
  if (kind === "care" || kind === "exam_off" || kind === "jailbreak") return ok;

  // 1. Values from the private answer key the student hasn't given themselves.
  // A free explanation (no assignment governs) may use round values like 300 K
  // that also happen to appear in a key; the distinctive ones stay protected.
  const keyNumbers = protectedNumbers(ctx.answerKeys, ctx.visibleText, !ctx.policy.governing);
  if (keyNumbers.length) {
    const hit = numbersIn(text).find((n) => keyNumbers.some((k) => sameValue(k, n)));
    if (hit !== undefined) return fail("final_answer", `Contains ${hit}, a value from the private answer key.`);
  }

  // 2. Wording copied from the answer key or the teacher's notes.
  const visible = shingleSet(ctx.visibleText, 6);
  const draftShingles6 = shingleSet(text, 6);
  for (const key of ctx.answerKeys) {
    const overlap = [...shingleSet(key, 6)].filter((s) => draftShingles6.has(s) && !visible.has(s)).length;
    if (overlap >= 2) return fail("answer_key_match", "Repeats wording from the private answer key.");
  }
  for (const notes of ctx.teacherNotes) {
    const overlap = [...shingleSet(notes, 6)].filter((s) => draftShingles6.has(s) && !visible.has(s)).length;
    if (overlap >= 1) return fail("prompt_leak", "Quotes the teacher's private notes.");
  }

  // 3. The system prompt itself.
  const visible8 = shingleSet(ctx.visibleText, 8);
  const draft8 = shingleSet(text, 8);
  const promptOverlap = [...shingleSet(ctx.systemPrompt, 8)].filter((s) => draft8.has(s) && !visible8.has(s)).length;
  if (promptOverlap >= 2 || /\bSAGE-POLICY\b/.test(text)) return fail("prompt_leak", "Repeats Sage's instructions.");

  // 4. Bare verdicts on an answer with no working.
  if (kind === "ask_working" && verdict.test(text)) {
    return fail("bare_verdict", "Confirms or denies a bare final answer.");
  }

  // 5. Submittable work for the assignment (or any deliverable request).
  const governedKind = ctx.policy.governing?.kind ?? ctx.homeKind ?? (kind === "assist" ? "any" : null);
  if (governedKind === "essay" || governedKind === "any") {
    const paras = proseParagraphs(text);
    const long = paras.filter((w) => w >= 60).length;
    const total = paras.reduce((a, b) => a + b, 0);
    if (long >= 2 || paras.some((w) => w >= 110) || total >= 380) {
      return fail("submittable_text", `Essay-like prose (${total} words in paragraphs).`);
    }
  }
  if (governedKind === "code" || governedKind === "any") {
    const lines = codeLines(text);
    if (lines >= 12) return fail("full_code", `${lines} lines of code.`);
  }
  // The function a code assignment asks for is never written for the student, in any chat.
  for (const name of ctx.codeNames ?? []) {
    const def = new RegExp(`(def|function|fn|void|int|double|float|public|static)\\s+[\\w<>\\[\\]]*\\s*${name}\\s*\\(`);
    if (def.test(text)) return fail("full_code", `Writes ${name}() for the student.`);
  }
  return ok;
}

/** Function names a code assignment asks for ("Write newton_raphson(f, df, …)"). */
export function codeNamesIn(instructions: string): string[] {
  return [...new Set([...instructions.matchAll(/\b([a-z_][a-z0-9_]{2,})\s*\(/gi)].map((m) => m[1]))].filter(
    (n) => !/^(print|range|len|abs|max|min|sum|sin|cos|tan|exp|log|sqrt|df|f)$/i.test(n),
  );
}

/**
 * When the model guard can't run (timeout, provider down), a governed draft
 * still goes out only if it is clearly low-risk: no numbers the student
 * hasn't seen and no code. Otherwise Sage sends a safe hint.
 */
export function riskyWithoutModelCheck(draft: string, visibleText: string): boolean {
  const visible = numbersIn(visibleText);
  const fresh = numbersIn(draft).filter((n) => !(Math.abs(n) < 10 && Number.isInteger(n)) && !visible.some((v) => sameValue(v, n)));
  return fresh.length > 0 || /```/.test(draft);
}

/** What the model guard returns. */
export const guardVerdictSchema = z.object({
  pass: z.boolean(),
  category: z.enum(guardCategories),
  reason: z.string().max(300),
});
export type GuardVerdict = z.infer<typeof guardVerdictSchema>;

export const guardJsonShape = `{
  "pass": boolean,
  "category": ${guardCategories.map((c) => `"${c}"`).join(" | ")},
  "reason": string (one short sentence)
}`;

/**
 * Sentence boundary for streamed replies: emit text up to here once it passes
 * the checks. Never inside an open code fence or display maths: a block goes
 * out whole, after it has been checked whole.
 */
export function lastSafeBoundary(text: string): number {
  let idx = -1;
  for (const m of text.matchAll(/(?:[.!?:](?=\s)|\n)/g)) idx = (m.index ?? 0) + m[0].length;
  for (const fence of ["```", "$$"]) {
    const parts = text.split(fence);
    if (parts.length % 2 === 0) {
      // An odd number of fences: the last one is still open.
      const open = text.lastIndexOf(fence);
      if (idx > open) idx = open;
    }
  }
  return idx;
}
