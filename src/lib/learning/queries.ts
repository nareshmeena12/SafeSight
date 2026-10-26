import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Mastery per topic for one student, as a teacher sees it: topic, mastery and
 * how many checks it rests on. Read with the teacher's own client, so
 * row-level security limits it to the teacher's courses. Never answers,
 * explanations or chat text.
 */
export async function studentMasterySummary(db: SupabaseClient<Database>, studentId: string) {
  const { data, error } = await db
    .from("topic_mastery")
    .select("course_id, topic_key, topic, mastery, evidence, updated_at")
    .eq("student_id", studentId)
    .order("mastery", { ascending: true })
    .limit(30);
  if (error) console.error("mastery summary:", error.message);
  return (data ?? []).map((m) => ({ courseId: m.course_id, topic: m.topic, mastery: m.mastery, evidence: m.evidence, updatedAt: m.updated_at }));
}
