/**
 * Deterministic parts of mock test grading (pure, tested): reading numbers
 * the way students write them, the numeric tolerance check, and the marks.
 */

/** Numbers in a piece of text: "1,200", "−3", "1.2e5", "1.2 × 10^5", "6.02x10^23". */
export function readNumbers(text: string): number[] {
  const t = text
    .replace(/[−–]/g, "-")
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    .replace(/\s*[×x*]\s*10\s*\^\s*\{?\s*(-?\d+)\s*\}?/gi, "e$1");
  return [...t.matchAll(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)].map((m) => Number(m[0])).filter(Number.isFinite);
}

/** The value of a final answer like "−0.462 kJ/K" (its first number), or null. */
export function finalValue(finalAnswer: string): number | null {
  return readNumbers(finalAnswer)[0] ?? null;
}

/**
 * A numeric answer matches when one of the student's last three numbers is
 * within `tolerance` (relative) of the final value — the final line of
 * working usually holds the result, and units like m³ add stray digits.
 */
export function numericMatch(answer: string, finalAnswer: string, tolerance = 0.02): boolean {
  const want = finalValue(finalAnswer);
  if (want === null) return false;
  return readNumbers(answer)
    .slice(-3)
    .some((got) => (want === 0 ? Math.abs(got) < 1e-9 : Math.abs(got - want) / Math.abs(want) <= tolerance));
}

export type Verdict = "correct" | "partly" | "not_yet" | "unchecked";

/** Keep a model's score inside its verdict's band (as practice grading does). */
export function bandScore(verdict: Exclude<Verdict, "unchecked">, score: number): number {
  const s = Number.isFinite(score) ? score : 0;
  const banded = verdict === "correct" ? Math.max(0.8, Math.min(1, s)) : verdict === "partly" ? Math.min(0.79, Math.max(0.3, s)) : Math.min(0.29, Math.max(0, s));
  return Math.round(banded * 100) / 100;
}

/**
 * Marks for a graded test. Unchecked questions (the grader was unavailable)
 * are left out of both sides, so they never count against the student.
 */
export function mockScore(items: { marks: number; score: number | null; verdict: Verdict | null }[]) {
  const checked = items.filter((i) => i.verdict && i.verdict !== "unchecked" && typeof i.score === "number");
  const max = checked.reduce((a, i) => a + i.marks, 0);
  const marks = Math.round(checked.reduce((a, i) => a + i.marks * (i.score ?? 0), 0) * 10) / 10;
  return { marks, max, score: max ? Math.round((marks / max) * 100) / 100 : null, unchecked: items.length - checked.length };
}

/** Marks-weighted score per topic, for mastery. */
export function topicScores(items: { topic: string; marks: number; score: number | null; verdict: Verdict | null }[]) {
  const by = new Map<string, { marks: number; earned: number }>();
  for (const i of items) {
    if (!i.topic || !i.verdict || i.verdict === "unchecked" || typeof i.score !== "number") continue;
    const t = by.get(i.topic) ?? { marks: 0, earned: 0 };
    t.marks += i.marks;
    t.earned += i.marks * i.score;
    by.set(i.topic, t);
  }
  return [...by].map(([topic, t]) => ({ topic, score: Math.round((t.earned / t.marks) * 100) / 100 }));
}

/** Seconds left on a test (never negative). */
export function secondsLeft(endsAt: string, now = Date.now()): number {
  return Math.max(0, Math.floor((Date.parse(endsAt) - now) / 1000));
}

/** Answers may still be saved this long after the end (a slow network at the last second). */
export const SAVE_GRACE_MS = 60_000;
