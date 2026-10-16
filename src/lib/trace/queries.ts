import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchPaged } from "./paged";

type Db = SupabaseClient<Database>;

/** Assignments in the student's courses, with their Trace status. RLS-scoped. */
export async function listStudentWriting(db: Db, studentId: string) {
  const [{ data: assignments, error }, { data: submissions, error: subError }] = await Promise.all([
    db
      .from("assignments")
      .select("id, title, ai_mode, due_at, course:courses(name, code)")
      .order("due_at", { ascending: true, nullsFirst: false }),
    db
      .from("submissions")
      .select("id, assignment_id, submitted_at, updated_at")
      .eq("student_id", studentId),
  ]);
  if (error) throw error;
  if (subError) throw subError;

  const byAssignment = new Map(submissions.map((s) => [s.assignment_id, s]));
  return assignments.map((a) => ({ ...a, submission: byAssignment.get(a.id) ?? null }));
}

/**
 * The assignment and the student's submission for it, creating the draft on
 * first visit. Returns null when the assignment isn't in the student's courses.
 */
export async function getOrStartDraft(db: Db, studentId: string, assignmentId: string) {
  const { data: assignment, error } = await db
    .from("assignments")
    .select("id, title, instructions, ai_mode, due_at, course:courses(name, code)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  if (!assignment) return null;

  const select = "id, content, submitted_at, updated_at" as const;
  const existing = await db
    .from("submissions")
    .select(select)
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { assignment, submission: existing.data };

  const created = await db
    .from("submissions")
    .insert({ assignment_id: assignmentId, student_id: studentId })
    .select(select)
    .single();
  if (!created.error) return { assignment, submission: created.data };
  // 23505: another tab created it first; read that row.
  if (created.error.code !== "23505") throw created.error;

  const again = await db
    .from("submissions")
    .select(select)
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .single();
  if (again.error) throw again.error;
  return { assignment, submission: again.data };
}

/** Submitted work in the teacher's courses, newest first. RLS-scoped. */
export async function listCourseSubmissions(db: Db) {
  const { data, error } = await db
    .from("submissions")
    .select(
      "id, submitted_at, student:profiles(full_name), assignment:assignments(title, ai_mode, course:courses(name, code)), report:integrity_reports(paste_ratio, active_minutes, sessions)",
    )
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

/** Everything the replay needs for one submission, or null if not visible. */
export async function getReplay(db: Db, submissionId: string) {
  const { data: submission, error } = await db
    .from("submissions")
    .select(
      "id, content, submitted_at, student_id, student:profiles(full_name), assignment:assignments(id, title, ai_mode, course:courses(name, code)), report:integrity_reports(paste_ratio, active_minutes, sessions, summary, created_at)",
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw error;
  if (!submission) return null;

  const [events, snapshots] = await Promise.all([
    fetchPaged((from, to) =>
      db
        .from("writing_events")
        .select("type, size, at")
        .eq("submission_id", submissionId)
        .order("at")
        .order("id")
        .range(from, to),
    ),
    fetchPaged((from, to) =>
      db
        .from("writing_snapshots")
        .select("content, char_count, at")
        .eq("submission_id", submissionId)
        .order("at")
        .order("id")
        .range(from, to),
    ),
  ]);

  return {
    submission,
    events: events.map((e) => ({ type: e.type, size: e.size, at: Date.parse(e.at) })),
    snapshots: snapshots.map((s) => ({ content: s.content, charCount: s.char_count, at: Date.parse(s.at) })),
  };
}
