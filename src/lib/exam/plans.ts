import "server-only";
import { readMistakes } from "@/lib/learning/data";
import { courseHasMaterials, type Course } from "@/lib/sage/data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { buildSchedule, istToday, planTopics, type PlanDay, type StudentSignals } from "./plan";
import { planDaysSchema } from "./schemas";
import { courseTopics, notesForTopics, readExamInfo } from "./topics";

/**
 * Builds and saves a student's revision plan for one course (one plan per
 * course; planning again replaces it, keeping the days already behind them).
 * The plan itself is computed in code (lib/exam/plan.ts) from the course's
 * topics and the student's own mastery, mistake log and questions to Sage.
 */

async function studentSignals(studentId: string, courseId: string): Promise<StudentSignals> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const [mastery, mistakes, messages] = await Promise.all([
    admin.from("topic_mastery").select("topic, topic_key, mastery, evidence").eq("student_id", studentId).eq("course_id", courseId).limit(80),
    readMistakes(studentId, courseId, 40),
    admin
      .from("messages")
      .select("topic, conversations!inner(student_id, course_id)")
      .eq("conversations.student_id", studentId)
      .eq("conversations.course_id", courseId)
      .eq("role", "user")
      .not("topic", "is", null)
      .gte("created_at", since)
      .limit(400),
  ]);
  const asked = new Map<string, number>();
  for (const m of messages.data ?? []) if (m.topic) asked.set(m.topic, (asked.get(m.topic) ?? 0) + 1);
  return {
    mastery: (mastery.data ?? []).map((m) => ({ topic: m.topic, topicKey: m.topic_key, mastery: m.mastery, evidence: m.evidence })),
    mistakes: mistakes.map((m) => ({ label: m.label, topic: m.topic, count: m.count, reviewed: Boolean(m.reviewed_at) })),
    asked: [...asked].map(([topic, count]) => ({ topic, count })),
  };
}

export async function savePlan({
  studentId,
  course,
  examDate,
  minutesPerDay,
  now = new Date(),
}: {
  studentId: string;
  course: Course;
  examDate: string;
  minutesPerDay: number;
  now?: Date;
}): Promise<{ id: string }> {
  const today = istToday(now);
  const admin = createAdminClient();
  const [info, signals, hasNotes, previous] = await Promise.all([
    readExamInfo(course.id),
    studentSignals(studentId, course.id),
    courseHasMaterials(course.id),
    admin.from("exam_plans").select("days, done, checked").eq("student_id", studentId).eq("course_id", course.id).maybeSingle(),
  ]);
  const sources = await courseTopics(course, studentId, info);
  const topics = planTopics(sources.base, signals);

  // A page of the notes for each topic that doesn't have one yet.
  if (hasNotes) {
    const missing = topics.filter((t) => !t.notes.length).map((t) => t.title);
    const found = missing.length ? await notesForTopics(course.id, missing, studentId) : new Map();
    for (const t of topics) if (!t.notes.length) t.notes = found.get(t.title) ?? [];
  }

  const hasReview = signals.mistakes.some((m) => !m.reviewed) || signals.mastery.some((m) => m.mastery < 0.6);
  const { days, skipped } = buildSchedule({ topics, today, examDate, minutesPerDay, hasReview });

  // Planning again keeps the days already behind the student, with their ticks.
  const pastDays: PlanDay[] = (planDaysSchema.safeParse(previous.data?.days ?? []).data ?? []).filter((d) => d.date < today);
  const pastIds = new Set(pastDays.flatMap((d) => d.tasks.map((t) => t.id)));
  const row = {
    student_id: studentId,
    course_id: course.id,
    exam_date: examDate,
    minutes_per_day: minutesPerDay,
    topics: topics as unknown as Json,
    days: [...pastDays, ...days] as unknown as Json,
    done: (previous.data?.done ?? []).filter((id) => pastIds.has(id)),
    checked: (previous.data?.checked ?? []).filter((k) => topics.some((t) => t.key === k)),
    sources: { syllabus: sources.fromSyllabus, notes: sources.fromNotes, pattern: info.pattern, skipped },
    updated_at: now.toISOString(),
  };
  const { data, error } = await admin.from("exam_plans").upsert(row, { onConflict: "student_id,course_id" }).select("id").single();
  if (error || !data) throw new Error(`exam plan: ${error?.message}`);
  return data;
}
