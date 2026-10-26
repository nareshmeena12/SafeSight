import "server-only";
import { activeAssignments } from "@/lib/sage/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "./ai";
import { checkFeedback } from "./checks";
import { recordMastery } from "./data";
import type { Mastery } from "./mastery";
import { explainBackPrompt, explainBackSystem } from "./prompts";
import { explainBackJsonShape, explainBackOutputSchema } from "./schemas";
import { topicKey, topicLabel } from "./topics";

/**
 * Explain it back: after a problem, the student explains the idea in their
 * own words; Sage gives short feedback on gaps. The score is a mastery signal.
 */
export async function explainBack({
  studentId,
  course,
  conversationId,
  topic: rawTopic,
  explanation,
}: {
  studentId: string;
  course: { id: string; name: string; code: string };
  conversationId: string | null;
  topic: string;
  explanation: string;
}): Promise<
  | { ok: true; score: number; feedback: string; gaps: string[]; mastery: Mastery | null }
  | { ok: false; status: number; message: string }
> {
  const topic = topicLabel(rawTopic);
  const out = await generateJson({
    feature: "explain_back",
    userId: studentId,
    system: explainBackSystem(explainBackJsonShape),
    prompt: explainBackPrompt({ course: course.code ? `${course.code} ${course.name}` : course.name, topic, explanation }),
    schema: explainBackOutputSchema,
    name: "explain_back",
    maxOutputTokens: 3000,
    temperature: 0.2,
  });
  if (!out) return { ok: false, status: 503, message: "Sage couldn't read your explanation just now. It's still in the box — try again in a moment." };

  const assignments = await activeAssignments(course.id);
  const safe = checkFeedback(`${out.feedback}\n${out.gaps.join("\n")}`, explanation, assignments.map((a) => a.answerKey));
  const feedback = safe.ok ? out.feedback : "Thanks for putting it in your own words. Read it once more: does it say what changes, why, and how you'd spot it in a new problem?";
  const gaps = safe.ok ? out.gaps.map((g) => g.trim()).filter(Boolean).slice(0, 3) : [];
  const score = Math.round(Math.min(1, Math.max(0, out.score)) * 100) / 100;

  const { error } = await createAdminClient().from("explain_backs").insert({
    student_id: studentId,
    course_id: course.id,
    conversation_id: conversationId,
    topic,
    topic_key: topicKey(topic),
    explanation,
    score,
    feedback,
    gaps,
  });
  if (error) throw new Error(`explain back: ${error.message}`);
  const mastery = await recordMastery({ studentId, courseId: course.id, topic, score, source: "explain_back" });
  return { ok: true, score, feedback, gaps, mastery };
}
