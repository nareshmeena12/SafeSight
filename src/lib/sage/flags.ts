import { isAnswerSeeking, type Intent, type Labels } from "./labels";
import type { Policy } from "./policy";

/**
 * flag_to_teacher rules (PLAN.md §4). Pure: the route decides, then writes the
 * flags with the service role. Reasons are neutral evidence, never verdicts.
 */

export type FlagType = "answer_seeking" | "exam_mode_attempt" | "instruction_override" | "wellbeing";
export type FlagSeverity = "low" | "medium" | "high";
export type FlagDecision = { type: FlagType; severity: FlagSeverity; reason: string };

/** Answer-seeking messages in the recent window that raise a flag. */
export const ANSWER_SEEKING_THRESHOLD = 3;
/** ...and that raise it to medium. */
export const ANSWER_SEEKING_MEDIUM = 5;
/** How many recent student messages (this course, last 24 hours) the rule looks at. */
export const ANSWER_SEEKING_WINDOW = 10;

export function decideFlags({
  policy,
  labels,
  recentIntents,
  recentJailbreaks,
  context,
  existing,
}: {
  policy: Pick<Policy, "kind" | "flags" | "governing">;
  labels: Labels;
  /** Intents of the student's recent messages in this course, oldest first, including this one. */
  recentIntents: (Intent | null)[];
  /** Jailbreak attempts in this course in the last 24 hours, before this message. */
  recentJailbreaks: number;
  /** "Thermodynamics problem set 3", or "Ask Sage (ME201)". */
  context: string;
  /** Open flags for this student and course raised in the last 24 hours. */
  existing: { type: FlagType; severity: FlagSeverity }[];
}): FlagDecision[] {
  const out: FlagDecision[] = [];
  const add = (d: FlagDecision) => {
    if (!existing.some((e) => e.type === d.type && e.severity === d.severity)) out.push(d);
  };

  if (labels.distress !== "none" || labels.intent === "distress") {
    add({
      type: "wellbeing",
      severity: labels.distress === "high" ? "high" : "medium",
      reason:
        labels.distress === "high"
          ? `A message on ${context} suggests the student may be in distress. Sage shared the counselling contact and a helpline.`
          : `A message on ${context} suggests the student may be under strain. Sage responded with care and shared support options.`,
    });
  }

  if (policy.flags.examAttempt) {
    add({
      type: "exam_mode_attempt",
      severity: "medium",
      reason: `Asked Sage about ${policy.governing?.title ?? context}, which is in Exam mode. Sage did not help with it.`,
    });
  }

  if (policy.flags.jailbreak) {
    const attempts = recentJailbreaks + 1;
    add({
      type: "instruction_override",
      severity: attempts >= 2 ? "medium" : "low",
      reason:
        attempts >= 2
          ? `Asked Sage ${attempts} times in a day to set aside its tutoring rules or show its instructions (${context}).`
          : `Asked Sage to set aside its tutoring rules or show its instructions (${context}).`,
    });
  }

  const window = recentIntents.slice(-ANSWER_SEEKING_WINDOW);
  const seeking = window.filter(isAnswerSeeking).length;
  if (isAnswerSeeking(labels.intent) && seeking >= ANSWER_SEEKING_THRESHOLD) {
    add({
      type: "answer_seeking",
      severity: seeking >= ANSWER_SEEKING_MEDIUM ? "medium" : "low",
      reason: `Asked for the full answer or finished work ${seeking} times in the last ${window.length} messages (${context}).`,
    });
  }

  return out;
}
