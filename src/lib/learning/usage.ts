import "server-only";
import { allowAiCall } from "@/lib/ai/usage-log";

/**
 * The learning tools' features in ai_usage (every call is logged by the
 * provider), and their per-student hourly limits, counted from ai_usage so
 * they hold across server instances.
 */

export type AiFeature =
  | "sage_mistake"
  | "practice_generate"
  | "practice_grade"
  | "refresher_generate"
  | "explain_back"
  | "recap"
  // S18 teacher tools reuse generateJson (their limits are set by their routes).
  | "ai_resilience"
  | "lens_viva"
  // S19 teacher insight tools (limits in their routes; the weekly job isn't limited).
  | "lecture_brief"
  | "lecture_brief_quiz"
  | "feedback_draft"
  // S20 exam prep: topics read from the notes, mock tests and their grading.
  | "exam_topics"
  | "mock_generate"
  | "mock_grade";

/** Calls per hour per student for each learning tool. */
export const LEARNING_LIMITS: Partial<Record<AiFeature, number>> = {
  practice_generate: 12,
  refresher_generate: 10,
  practice_grade: 60,
  explain_back: 20,
  recap: 30,
  exam_topics: 10,
  mock_generate: 6,
  mock_grade: 20,
};

/** Whether the student may make another call to this feature now (fails open). */
export function allowLearningCall(userId: string, feature: AiFeature) {
  const limit = LEARNING_LIMITS[feature];
  return limit ? allowAiCall(userId, feature, { limit, windowMs: 60 * 60 * 1000 }) : Promise.resolve(true);
}
