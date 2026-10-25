import type { Labels } from "@/lib/sage/labels";
import type { Policy } from "@/lib/sage/policy";
import { detectStruggle, type TopicMessage } from "./struggle";
import { topicKey, topicLabel } from "./topics";

/**
 * What Sage offers under a reply, decided in code after the policy: "Practice
 * this" for a free explanation, "Explain it back" after a full attempt was
 * checked, and a prerequisite refresher when the student keeps struggling on
 * a topic. Pure.
 */

export type LearningOffers = {
  practice: { topic: string } | null;
  explainBack: { topic: string } | null;
  refresher: { topic: string } | null;
};

export const NO_OFFERS: LearningOffers = { practice: null, explainBack: null, refresher: null };

/** A complete attempt checked by Sage: time to explain the idea back. */
export const EXPLAIN_BACK_ATTEMPT = 0.8;

export function decideOffers({
  policy,
  labels,
  explore,
  context,
  now = Date.now(),
}: {
  policy: Pick<Policy, "kind">;
  labels: Pick<Labels, "intent" | "topic" | "attemptQuality">;
  /** An Explore ("Ask Sage") chat, not an assignment chat. */
  explore: boolean;
  /** Recent labelled messages, mistakes, mastery and offers for this student in this course. */
  context: {
    messages: TopicMessage[];
    mistakes: { topic: string; count: number; reviewed: boolean }[];
    mastery: Map<string, { mastery: number; evidence: number }>;
    offers: Map<string, string>;
  } | null;
  now?: number;
}): LearningOffers {
  const topic = topicLabel(labels.topic ?? "");
  if (!topic || ["care", "exam_off", "jailbreak"].includes(policy.kind)) return NO_OFFERS;

  let refresher: LearningOffers["refresher"] = null;
  if (context) {
    const key = topicKey(topic);
    const struggle = detectStruggle({
      topic,
      messages: [
        { topic, intent: labels.intent === "concept" ? "concept_question" : labels.intent, attemptQuality: labels.attemptQuality, at: new Date(now).toISOString() },
        ...context.messages,
      ],
      mistakes: context.mistakes,
      mastery: context.mastery.get(key) ?? null,
      lastOfferAt: context.offers.get(key) ?? null,
      now,
    });
    if (struggle.struggling) refresher = { topic };
  }

  const practice =
    !refresher && explore && policy.kind === "explain" && (labels.intent === "concept" || labels.intent === "off_topic")
      ? { topic }
      : null;
  const explainBack = policy.kind === "check_work" && labels.attemptQuality >= EXPLAIN_BACK_ATTEMPT ? { topic } : null;
  return { practice, explainBack, refresher };
}
