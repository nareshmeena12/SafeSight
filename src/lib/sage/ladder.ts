import type { AiMode } from "@/components/product/mode-badge";
import type { Labels } from "./labels";

/** The hint ladder (PLAN.md §4). Index + 1 is the level stored in messages.hint_level. */
export const hintSteps = [
  { level: 1, name: "Clarify", student: "Sage asks what you've tried and where you're stuck." },
  { level: 2, name: "Nudge", student: "Sage names the idea or formula that applies." },
  { level: 3, name: "Guide", student: "Sage breaks the problem into steps; you do the first one." },
  { level: 4, name: "Parallel example", student: "Sage works a similar problem with different numbers." },
  { level: 5, name: "Check work", student: "Sage points to the exact line that needs another look." },
] as const;

export type HintLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Highest step Sage climbs to without a real attempt. In Learn mode, insisting
 * moves Sage at most to Guide; the worked parallel example needs the student
 * to have tried something. Assist mode may explain fully, so it goes one further.
 */
const capWithoutAttempt: Record<Exclude<AiMode, "exam">, HintLevel> = { learn: 3, assist: 4 };

/**
 * Next ladder step for Sage's reply. Climbs one step per turn, never skips,
 * and jumps to Check work when the student shares a worked attempt. Returns
 * null when the ladder doesn't apply (Exam mode, distress).
 */
export function nextHintLevel({
  mode,
  current,
  labels,
}: {
  mode: AiMode;
  /** Sage's last step in this conversation, or null before the first reply. */
  current: number | null;
  labels: Labels;
}): HintLevel | null {
  if (mode === "exam" || labels.intent === "distress" || labels.distress === "high") return null;
  const now: number = current ? clamp(current) : 0;

  if (labels.sharesSolution) return 5;
  if (labels.intent === "off_topic") return clamp(Math.max(now, 1));

  if (labels.attempted) {
    // After checking work, keep checking new attempts.
    if (now === 5) return 5;
    // An opening message that already shows work skips Clarify.
    return clamp(Math.min(Math.max(now + 1, 2), 4));
  }

  // A concept question gets at least a nudge: naming and explaining the idea is fine.
  const floor = labels.intent === "concept_question" ? 2 : 1;
  if (now === 0) return clamp(floor);
  const cap = capWithoutAttempt[mode];
  return clamp(Math.max(floor, now >= cap ? now : now + 1));
}

function clamp(n: number): HintLevel {
  return Math.min(5, Math.max(1, Math.round(n))) as HintLevel;
}
