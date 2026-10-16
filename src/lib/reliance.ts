/**
 * Reliance Score bands (PLAN.md §4): 0–100, higher means more dependence on AI.
 * Thresholds are a first guess; tune them once real data exists.
 */
export type RelianceBand = "low" | "medium" | "high";

export const relianceThresholds = { medium: 40, high: 70 } as const;

export function relianceBand(score: number): RelianceBand {
  if (score >= relianceThresholds.high) return "high";
  if (score >= relianceThresholds.medium) return "medium";
  return "low";
}
