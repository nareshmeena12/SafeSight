import type { AiMode } from "@/components/product/mode-badge";
import { isAnswerSeeking, type Intent, type Labels } from "./labels";

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
/** How many recent student messages in the conversation the rule looks at. */
export const ANSWER_SEEKING_WINDOW = 10;

export function decideFlags({
  mode,
  labels,
  recentIntents,
  recentOverrides,
  assignmentTitle,
  existing,
}: {
  mode: AiMode;
  labels: Labels;
  /** Intents of the student's recent messages in this conversation, oldest first, including this one. */
  recentIntents: (Intent | null)[];
  /** Instruction-override attempts in this conversation before this message. */
  recentOverrides: number;
  assignmentTitle: string;
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
          ? `A message on ${assignmentTitle} suggests the student may be in distress. Sage shared the counselling contact and a helpline.`
          : `A message on ${assignmentTitle} suggests the student may be under strain. Sage responded with care and shared support options.`,
    });
  }

  if (mode === "exam") {
    add({
      type: "exam_mode_attempt",
      severity: "medium",
      reason: `Opened Sage on ${assignmentTitle}, which is in Exam mode. Sage did not help with it.`,
    });
  }

  if (labels.instructionOverride) {
    const attempts = recentOverrides + 1;
    add({
      type: "instruction_override",
      severity: attempts >= 2 ? "medium" : "low",
      reason:
        attempts >= 2
          ? `Asked Sage ${attempts} times to set aside its tutoring rules on ${assignmentTitle}.`
          : `Asked Sage to set aside its tutoring rules on ${assignmentTitle}.`,
    });
  }

  const window = recentIntents.slice(-ANSWER_SEEKING_WINDOW);
  const seeking = window.filter(isAnswerSeeking).length;
  if (isAnswerSeeking(labels.intent) && seeking >= ANSWER_SEEKING_THRESHOLD) {
    add({
      type: "answer_seeking",
      severity: seeking >= ANSWER_SEEKING_MEDIUM ? "medium" : "low",
      reason: `Asked for the full answer ${seeking} times in the last ${window.length} messages on ${assignmentTitle}.`,
    });
  }

  return out;
}
