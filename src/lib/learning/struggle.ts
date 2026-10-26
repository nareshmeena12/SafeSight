import { relatedTopics } from "./topics";

/**
 * Prerequisite check: when does a student "keep struggling" on a topic?
 * Pure, from what Sage already records: labelled messages, the mistake log,
 * mastery, and when a refresher was last offered.
 */

export type TopicMessage = {
  topic: string | null;
  /** classify_message intent as stored (concept_question, answer_seeking, …). */
  intent: string | null;
  attemptQuality: number | null;
  at: string;
};

export type StruggleInput = {
  topic: string;
  /** The student's messages in this course over the last week, this one included. */
  messages: TopicMessage[];
  mistakes: { topic: string; count: number; reviewed: boolean }[];
  mastery: { mastery: number; evidence: number } | null;
  lastOfferAt: string | null;
  now?: number;
};

export const STRUGGLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Don't offer the same refresher again for this long. */
export const OFFER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

const NO_WORK = new Set(["answer_seeking", "pasted_question", "deliverable_request", "verify_answer"]);

export type StruggleResult = { struggling: false } | { struggling: true; reason: "stuck_questions" | "repeated_mistakes" | "low_mastery" };

export function detectStruggle(input: StruggleInput): StruggleResult {
  const now = input.now ?? Date.now();
  if (!input.topic.trim()) return { struggling: false };
  if (input.lastOfferAt && now - new Date(input.lastOfferAt).getTime() < OFFER_COOLDOWN_MS) return { struggling: false };

  const onTopic = input.messages.filter(
    (m) => m.topic && relatedTopics(m.topic, input.topic) && now - new Date(m.at).getTime() <= STRUGGLE_WINDOW_MS,
  );
  const stuck = onTopic.filter((m) => (m.intent && NO_WORK.has(m.intent)) || (m.attemptQuality ?? 0) < 0.5);

  const mistakes = input.mistakes
    .filter((m) => !m.reviewed && m.topic && relatedTopics(m.topic, input.topic))
    .reduce((n, m) => n + m.count, 0);
  if (mistakes >= 3) return { struggling: true, reason: "repeated_mistakes" };

  if (input.mastery && input.mastery.evidence >= 2 && input.mastery.mastery < 0.4 && onTopic.length >= 2) {
    return { struggling: true, reason: "low_mastery" };
  }

  // Many questions on one idea, mostly without the student's own working.
  if (onTopic.length >= 5 && stuck.length / onTopic.length >= 0.6) return { struggling: true, reason: "stuck_questions" };
  return { struggling: false };
}
