import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateMastery, type Mastery, type MasterySource } from "./mastery";
import type { TopicMessage } from "./struggle";
import { relatedTopics, topicKey, topicLabel } from "./topics";

/**
 * Writes for the learning tools (service role, server only) and the reads
 * the Sage route needs for the prerequisite check. Pages read with the
 * student's own client (row-level security) instead.
 */

export async function readMastery(studentId: string, courseId: string, key: string): Promise<Mastery | null> {
  const { data } = await createAdminClient()
    .from("topic_mastery")
    .select("mastery, evidence")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .eq("topic_key", key)
    .maybeSingle();
  return data ?? null;
}

/** Add one result to a topic's mastery. Returns the new value. */
export async function recordMastery({
  studentId,
  courseId,
  topic,
  score,
  source,
}: {
  studentId: string;
  courseId: string;
  topic: string;
  score: number;
  source: MasterySource;
}): Promise<Mastery | null> {
  const key = topicKey(topic);
  if (!key) return null;
  const current = await readMastery(studentId, courseId, key);
  const next = updateMastery(current, score, source);
  const { error } = await createAdminClient()
    .from("topic_mastery")
    .upsert(
      {
        student_id: studentId,
        course_id: courseId,
        topic_key: key,
        topic: topicLabel(topic),
        mastery: next.mastery,
        evidence: next.evidence,
        last_source: source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,course_id,topic_key" },
    );
  if (error) {
    console.error("mastery:", error.message);
    return null;
  }
  return next;
}

export type MistakeRow = { id: string; label: string; label_key: string; topic: string; count: number; reviewed_at: string | null };

export async function readMistakes(studentId: string, courseId: string, limit = 20): Promise<MistakeRow[]> {
  const { data, error } = await createAdminClient()
    .from("mistake_patterns")
    .select("id, label, label_key, topic, count, reviewed_at")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) console.error("mistakes:", error.message);
  return data ?? [];
}

/**
 * Add a mistake to the log: the same pattern (by id, by key, or a closely
 * related label) counts up; a new one starts at 1. A reviewed pattern that
 * shows up again is back on the list.
 */
export async function recordMistake({
  studentId,
  courseId,
  label,
  topic,
  sameAsId,
  existing,
}: {
  studentId: string;
  courseId: string;
  label: string;
  topic: string;
  sameAsId?: string | null;
  existing?: MistakeRow[];
}) {
  const key = topicKey(label);
  if (!key) return;
  const admin = createAdminClient();
  const rows = existing ?? (await readMistakes(studentId, courseId, 50));
  const match =
    rows.find((r) => r.id === sameAsId) ?? rows.find((r) => r.label_key === key) ?? rows.find((r) => relatedTopics(r.label, label));
  const now = new Date().toISOString();
  if (match) {
    const { error } = await admin
      .from("mistake_patterns")
      .update({ count: match.count + 1, last_seen_at: now, reviewed_at: null })
      .eq("id", match.id);
    if (error) console.error("mistake:", error.message);
    return;
  }
  const { error } = await admin.from("mistake_patterns").insert({
    student_id: studentId,
    course_id: courseId,
    label: topicLabel(label),
    label_key: key,
    topic: topicLabel(topic),
    topic_key: topicKey(topic),
  });
  // A parallel insert of the same pattern: count it instead.
  if (error?.code === "23505") return recordMistake({ studentId, courseId, label, topic });
  if (error) console.error("mistake:", error.message);
}

/** What the prerequisite check needs for one student in one course. */
export async function readLearningContext(studentId: string, courseId: string) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [messages, mistakes, mastery, offers] = await Promise.all([
    admin
      .from("messages")
      .select("topic, intent, attempt_quality, created_at, conversations!inner(student_id, course_id)")
      .eq("conversations.student_id", studentId)
      .eq("conversations.course_id", courseId)
      .eq("role", "user")
      .not("topic", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(80),
    admin
      .from("mistake_patterns")
      .select("topic, count, reviewed_at")
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .limit(50),
    admin.from("topic_mastery").select("topic_key, mastery, evidence").eq("student_id", studentId).eq("course_id", courseId),
    admin
      .from("learning_offers")
      .select("topic_key, offered_at")
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .eq("kind", "refresher"),
  ]);
  return {
    messages: (messages.data ?? []).map(
      (m): TopicMessage => ({ topic: m.topic, intent: m.intent, attemptQuality: m.attempt_quality, at: m.created_at }),
    ),
    mistakes: (mistakes.data ?? []).map((m) => ({ topic: m.topic, count: m.count, reviewed: Boolean(m.reviewed_at) })),
    mastery: new Map((mastery.data ?? []).map((m) => [m.topic_key, { mastery: m.mastery, evidence: m.evidence }])),
    offers: new Map((offers.data ?? []).map((o) => [o.topic_key, o.offered_at])),
  };
}
export type LearningContext = Awaited<ReturnType<typeof readLearningContext>>;

export async function recordOffer(studentId: string, courseId: string, topic: string) {
  const key = topicKey(topic);
  if (!key) return;
  const { error } = await createAdminClient()
    .from("learning_offers")
    .upsert(
      { student_id: studentId, course_id: courseId, topic_key: key, kind: "refresher", offered_at: new Date().toISOString() },
      { onConflict: "student_id,course_id,topic_key,kind" },
    );
  if (error) console.error("offer:", error.message);
}
