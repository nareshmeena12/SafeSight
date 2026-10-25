import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { StudentNumbersView } from "@/components/numbers/student-numbers";
import {
  checkAnswer,
  expectedAnswer,
  numberSetSchema,
  studentValues,
  type CheckResult,
  type NumberSet,
} from "./numbers";

/**
 * Per-student numbers on the server (S18). The number sets are teacher-only
 * under RLS; students' pages and Sage read them with the service role, only
 * after the student's access to the assignment was proven under RLS.
 */

type Db = SupabaseClient<Database>;

type SetRow = Pick<
  Database["public"]["Tables"]["assignment_number_sets"]["Row"],
  "variables" | "formula" | "answer_label" | "answer_unit" | "tolerance_pct"
>;

/** A stored row as a NumberSet, or null if it no longer validates. */
export function toNumberSet(row: SetRow): NumberSet | null {
  const parsed = numberSetSchema.safeParse({
    variables: row.variables,
    formula: row.formula,
    answerLabel: row.answer_label,
    answerUnit: row.answer_unit,
    tolerancePct: Number(row.tolerance_pct),
  });
  return parsed.success ? parsed.data : null;
}

/** The number set for one assignment (service role). */
export async function readNumberSet(assignmentId: string): Promise<NumberSet | null> {
  const { data, error } = await createAdminClient()
    .from("assignment_number_sets")
    .select("*")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (error) {
    console.warn("number set:", error.message);
    return null;
  }
  return data ? toNumberSet(data) : null;
}

/** Number sets for every assignment in a course (service role), by assignment id. */
export async function readCourseNumberSets(courseId: string): Promise<Map<string, NumberSet>> {
  const { data, error } = await createAdminClient()
    .from("assignment_number_sets")
    .select("*, assignment:assignments!inner(course_id)")
    .eq("assignment.course_id", courseId);
  if (error) {
    // Sage still answers without them; the guard keeps the static answer key.
    console.warn("number sets:", error.message);
    return new Map();
  }
  const out = new Map<string, NumberSet>();
  for (const row of data ?? []) {
    const set = toNumberSet(row);
    if (set) out.set(row.assignment_id, set);
  }
  return out;
}

export type StudentNumbers = {
  set: NumberSet;
  values: Record<string, number>;
  answer: { text: string; value: number | null; updatedAt: string } | null;
};

/**
 * The student's own numbers and saved answer for an assignment, or null when
 * it has none. Call only after the student's access was proven under RLS.
 */
export async function getStudentNumbers(db: Db, studentId: string, assignmentId: string): Promise<StudentNumbers | null> {
  const set = await readNumberSet(assignmentId);
  if (!set) return null;
  // The student's own answer, read under RLS.
  const { data } = await db
    .from("numeric_answers")
    .select("answer_text, answer_value, updated_at")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  return {
    set,
    values: studentValues(set.variables, { studentId, assignmentId }),
    answer: data ? { text: data.answer_text, value: data.answer_value, updatedAt: data.updated_at } : null,
  };
}

/** The auto-check of a saved answer against this student's own expected answer. */
export function checkStudentAnswer(numbers: StudentNumbers): CheckResult | null {
  if (!numbers.answer) return null;
  const expected = expectedAnswer(numbers.set, numbers.values);
  if (expected === null) return null;
  return checkAnswer(expected, numbers.answer.value, numbers.set.tolerancePct);
}

// ---------------------------------------------------------------- teacher view

export type NumbersRow = {
  studentId: string;
  name: string;
  values: Record<string, number>;
  expected: number | null;
  answer: { text: string; value: number | null; updatedAt: string } | null;
  result: CheckResult | null;
  submittedAt: string | null;
};

/**
 * Every student's values, expected answer, given answer and check result for
 * one assignment in the teacher's course. Read with the teacher's own client,
 * so RLS keeps it to their courses. Null when the assignment isn't theirs.
 */
export async function getClassNumbers(db: Db, teacherId: string, assignmentId: string) {
  const { data: assignment, error } = await db
    .from("assignments")
    .select("id, title, instructions, ai_mode, course:courses!inner(id, name, code, teacher_id)")
    .eq("id", assignmentId)
    .eq("courses.teacher_id", teacherId)
    .maybeSingle();
  if (error) throw new Error(`assignment: ${error.message}`);
  if (!assignment) return null;

  const [setRow, roster, answers, submissions] = await Promise.all([
    db.from("assignment_number_sets").select("*").eq("assignment_id", assignmentId).maybeSingle(),
    db.from("enrollments").select("student_id, student:profiles(full_name)").eq("course_id", assignment.course.id),
    db.from("numeric_answers").select("student_id, answer_text, answer_value, updated_at").eq("assignment_id", assignmentId),
    db.from("submissions").select("student_id, submitted_at").eq("assignment_id", assignmentId),
  ]);
  for (const r of [setRow, roster, answers, submissions]) if (r.error) throw new Error(`numbers: ${r.error.message}`);

  const set = setRow.data ? toNumberSet(setRow.data) : null;
  const answerBy = new Map((answers.data ?? []).map((a) => [a.student_id, a]));
  const submittedBy = new Map((submissions.data ?? []).map((s) => [s.student_id, s.submitted_at]));

  const rows: NumbersRow[] = set
    ? (roster.data ?? [])
        .map((r) => {
          const values = studentValues(set.variables, { studentId: r.student_id, assignmentId });
          const expected = expectedAnswer(set, values);
          const a = answerBy.get(r.student_id);
          const answer = a ? { text: a.answer_text, value: a.answer_value, updatedAt: a.updated_at } : null;
          return {
            studentId: r.student_id,
            name: r.student?.full_name || "Unnamed student",
            values,
            expected,
            answer,
            result: answer && expected !== null ? checkAnswer(expected, answer.value, set.tolerancePct) : null,
            submittedAt: submittedBy.get(r.student_id) ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const { course, ...rest } = assignment;
  return { assignment: rest, course: { id: course.id, name: course.name, code: course.code }, set, rows };
}

/** What the student's "Your numbers" card shows, or null when the assignment has no number set. */
export async function studentNumbersView(
  db: Db,
  studentId: string,
  assignmentId: string,
  submittedAt: string | null,
): Promise<StudentNumbersView | null> {
  const numbers = await getStudentNumbers(db, studentId, assignmentId);
  if (!numbers) return null;
  const locked = Boolean(submittedAt);
  return {
    assignmentId,
    variables: numbers.set.variables.map(({ name, label, unit, decimals }) => ({ name, label, unit, decimals })),
    values: numbers.values,
    answerLabel: numbers.set.answerLabel,
    answerUnit: numbers.set.answerUnit,
    answer: numbers.answer?.text ?? null,
    locked,
    result: locked ? checkStudentAnswer(numbers) : null,
  };
}
