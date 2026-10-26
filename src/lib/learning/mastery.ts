/**
 * Mastery per topic (0–1): a running blend of the student's own results.
 * The first signal sets it; each later one moves it part of the way, so one
 * bad day doesn't erase steady work and one lucky answer doesn't make a
 * topic "strong". Pure, so the numbers can be tested and explained.
 */

export type MasterySource = "practice" | "review" | "refresher" | "explain_back" | "mock";

/** How far one new result moves the blend. */
export const MASTERY_WEIGHTS: Record<MasterySource, number> = {
  practice: 0.4,
  review: 0.4,
  refresher: 0.3,
  explain_back: 0.3,
  // S20: a topic's share of a timed mock test.
  mock: 0.4,
};

export type Mastery = { mastery: number; evidence: number };

export function updateMastery(current: Mastery | null, score: number, source: MasterySource): Mastery {
  const s = clamp01(score);
  if (!current || current.evidence === 0) return { mastery: round(s), evidence: 1 };
  const next = current.mastery + MASTERY_WEIGHTS[source] * (s - current.mastery);
  return { mastery: round(clamp01(next)), evidence: current.evidence + 1 };
}

export type MasteryBand = "needs_work" | "getting_there" | "strong";

/** < 0.4 needs work, < 0.75 getting there, otherwise strong. */
export function masteryBand(mastery: number): MasteryBand {
  if (mastery < 0.4) return "needs_work";
  if (mastery < 0.75) return "getting_there";
  return "strong";
}

export const masteryBandLabels: Record<MasteryBand, string> = {
  needs_work: "Needs practice",
  getting_there: "Getting there",
  strong: "Strong",
};

/** Topics to review: below 0.6, or with a repeated mistake not yet reviewed. Weakest first. */
export function reviewList<T extends { topicKey: string; mastery: number }>(
  topics: T[],
  mistakes: { topicKey: string; count: number; reviewed: boolean }[] = [],
): (T & { repeatedMistakes: number })[] {
  return topics
    .map((t) => ({
      ...t,
      repeatedMistakes: mistakes
        .filter((m) => !m.reviewed && m.count >= 2 && m.topicKey && m.topicKey === t.topicKey)
        .reduce((n, m) => n + m.count, 0),
    }))
    .filter((t) => t.mastery < 0.6 || t.repeatedMistakes > 0)
    .sort((a, b) => a.mastery - b.mastery || b.repeatedMistakes - a.repeatedMistakes);
}

/** Mean score of a set's graded items (0–1), or null when nothing is graded. */
export function setScore(scores: (number | null | undefined)[]): number | null {
  const graded = scores.filter((s): s is number => typeof s === "number");
  return graded.length ? round(graded.reduce((a, b) => a + b, 0) / graded.length) : null;
}

function clamp01(n: number) {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
