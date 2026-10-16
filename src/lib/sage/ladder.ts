/** The hint ladder (PLAN.md §4). Index + 1 is the level stored in messages.hint_level. */
export const hintSteps = [
  { level: 1, name: "Clarify", student: "Sage asks what you've tried and where you're stuck." },
  { level: 2, name: "Nudge", student: "Sage names the idea or formula that applies." },
  { level: 3, name: "Guide", student: "Sage breaks the problem into steps; you do the first one." },
  { level: 4, name: "Parallel example", student: "Sage works a different problem using the same method." },
  { level: 5, name: "Check work", student: "Sage points to the exact line that needs another look." },
] as const;

export type HintLevel = 1 | 2 | 3 | 4 | 5;

export function clampLevel(n: number, max = 5): HintLevel {
  return Math.min(max, Math.max(1, Math.round(n))) as HintLevel;
}
