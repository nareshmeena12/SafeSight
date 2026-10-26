import "server-only";
import { toNumberSet } from "@/lib/numbers/data";
import { checkAnswer, expectedAnswer, studentValues } from "@/lib/numbers/numbers";
import { storedCriteriaSchema } from "@/lib/feedback/rubric";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/teacher/queries";
import {
  assignmentScores,
  coAttainment,
  DEFAULT_SETTINGS,
  poAttainment,
  programAttainment,
  selfStudyScoresByOutcome,
  SELF_STUDY_MIN_STUDENTS,
  testScoresByOutcome,
  type AssignmentResult,
  type AttainmentSettings,
  type CoResult,
  type Evidence,
  type Mapping,
  type Outcome,
  type PoResult,
  type ProgramOutcome,
  type ProgramPoResult,
  type SelfStudyItem,
} from "./attainment";
import { marksInOrder } from "./marks";
import { sortProgramOutcomes } from "./outcomes";
import {
  buildCourseReport,
  buildProgramReport,
  type AssessmentSummary,
  type ProgramCourseSummary,
  type ReportDoc,
} from "./report";

/**
 * Accreditation data on the server (S24). Course reads take a Supabase
 * client: the teacher's own (row-level security keeps it to their courses)
 * for course pages, or the service role for a programme report, after the
 * viewer's access to the programme was checked under RLS. Every query is
 * filtered by course explicitly, so both behave the same. Students' own
 * practice and mock tests are always read with the service role and only
 * leave this file as class counts.
 */

export type AccreditationCourse = {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  institutionId: string | null;
};

export type ProgramSummary = { id: string; name: string; department: string; institutionId: string | null; createdBy: string | null };

export type CourseAssignment = {
  id: string;
  title: string;
  aiMode: "learn" | "assist" | "exam";
  dueAt: string | null;
  assessment: { id: string; weight: number; outcomeIds: string[] } | null;
};

export type CourseTest = {
  id: string;
  title: string;
  heldOn: string | null;
  weight: number;
  questions: { id: string; label: string; maxMarks: number; outcomeIds: string[] }[];
};

export type CourseAccreditationData = {
  course: AccreditationCourse;
  outcomes: Outcome[];
  program: ProgramSummary | null;
  programOutcomes: ProgramOutcome[];
  mappings: Mapping[];
  settings: AttainmentSettings;
  hasSettings: boolean;
  assignments: CourseAssignment[];
  tests: CourseTest[];
  topics: { id: string; title: string; unit: string }[];
  topicOutcomes: { topicId: string; outcomeId: string }[];
};

/** Reads every page of a query (PostgREST returns at most 1,000 rows at a time). */
async function all<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let i = 0; i < 30; i++) {
    const { data, error } = await page(i * size, i * size + size - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toSettings(row: {
  target_pct: number;
  level1_pct: number;
  level2_pct: number;
  level3_pct: number;
  target_level: number;
  practice_weight: number;
  mock_weight: number;
  academic_year: string;
} | null): AttainmentSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    targetPct: Number(row.target_pct),
    level1Pct: Number(row.level1_pct),
    level2Pct: Number(row.level2_pct),
    level3Pct: Number(row.level3_pct),
    targetLevel: Number(row.target_level),
    practiceWeight: Number(row.practice_weight),
    mockWeight: Number(row.mock_weight),
    academicYear: row.academic_year,
  };
}

/** The course if the signed-in teacher (RLS client) runs it. */
export async function accreditationCourse(db: Db, userId: string, courseId: string): Promise<AccreditationCourse | null> {
  const { data } = await db.from("courses").select("id, name, code, teacher_id, institution_id").eq("id", courseId).maybeSingle();
  if (!data || data.teacher_id !== userId) return null;
  return { id: data.id, name: data.name, code: data.code, teacherId: data.teacher_id, institutionId: data.institution_id };
}

/** Everything the course's accreditation pages and reports need, read with `db`. */
export async function readCourseAccreditation(db: Db, course: AccreditationCourse): Promise<CourseAccreditationData> {
  const courseId = course.id;
  const [outcomes, link, settings, assignments, assessments, questions, units, topics, topicOutcomes] = await Promise.all([
    db.from("course_outcomes").select("id, code, description").eq("course_id", courseId).order("position"),
    db.from("course_programs").select("program_id").eq("course_id", courseId).maybeSingle(),
    db.from("course_attainment_settings").select("*").eq("course_id", courseId).maybeSingle(),
    db.from("assignments").select("id, title, ai_mode, due_at").eq("course_id", courseId).order("due_at", { ascending: true, nullsFirst: false }),
    db.from("course_assessments").select("id, kind, assignment_id, title, weight, held_on, outcome_ids, created_at").eq("course_id", courseId).order("created_at"),
    db.from("assessment_questions").select("id, assessment_id, label, max_marks, outcome_ids, position").eq("course_id", courseId).order("position"),
    db.from("course_units").select("id, title, position").eq("course_id", courseId).order("position"),
    db.from("course_topics").select("id, unit_id, title, position").eq("course_id", courseId).order("position"),
    db.from("course_topic_outcomes").select("topic_id, outcome_id").eq("course_id", courseId),
  ]);
  for (const r of [outcomes, link, settings, assignments, assessments, questions, units, topics, topicOutcomes]) {
    if (r.error) throw new Error(`accreditation: ${r.error.message}`);
  }

  let program: ProgramSummary | null = null;
  let programOutcomes: ProgramOutcome[] = [];
  let mappings: Mapping[] = [];
  if (link.data) {
    const [p, pos, maps] = await Promise.all([
      db.from("programs").select("id, name, department, institution_id, created_by").eq("id", link.data.program_id).maybeSingle(),
      db.from("program_outcomes").select("id, kind, code, title, description").eq("program_id", link.data.program_id),
      db.from("co_po_mappings").select("outcome_id, program_outcome_id, level, justification").eq("course_id", courseId),
    ]);
    if (p.data) {
      program = { id: p.data.id, name: p.data.name, department: p.data.department, institutionId: p.data.institution_id, createdBy: p.data.created_by };
      programOutcomes = sortProgramOutcomes(
        (pos.data ?? []).map((o) => ({ id: o.id, kind: o.kind === "pso" ? ("pso" as const) : ("po" as const), code: o.code, title: o.title, description: o.description })),
      );
      const poIds = new Set(programOutcomes.map((o) => o.id));
      // Only mappings to the programme the course is in now.
      mappings = (maps.data ?? [])
        .filter((m) => poIds.has(m.program_outcome_id))
        .map((m) => ({ outcomeId: m.outcome_id, programOutcomeId: m.program_outcome_id, level: m.level, justification: m.justification }));
    }
  }

  const coIds = new Set((outcomes.data ?? []).map((o) => o.id));
  const keep = (ids: string[]) => ids.filter((id) => coIds.has(id));
  const byAssignment = new Map((assessments.data ?? []).filter((a) => a.assignment_id).map((a) => [a.assignment_id!, a]));
  const unitTitle = new Map((units.data ?? []).map((u) => [u.id, u.title]));
  const unitOrder = new Map((units.data ?? []).map((u) => [u.id, u.position]));

  return {
    course,
    outcomes: (outcomes.data ?? []).map((o) => ({ id: o.id, code: o.code, description: o.description })),
    program,
    programOutcomes,
    mappings,
    settings: toSettings(settings.data),
    hasSettings: Boolean(settings.data),
    assignments: (assignments.data ?? []).map((a) => {
      const row = byAssignment.get(a.id);
      return {
        id: a.id,
        title: a.title,
        aiMode: a.ai_mode,
        dueAt: a.due_at,
        assessment: row ? { id: row.id, weight: Number(row.weight), outcomeIds: keep(row.outcome_ids) } : null,
      };
    }),
    tests: (assessments.data ?? [])
      .filter((a) => a.kind === "test")
      .map((a) => ({
        id: a.id,
        title: a.title,
        heldOn: a.held_on,
        weight: Number(a.weight),
        questions: (questions.data ?? [])
          .filter((q) => q.assessment_id === a.id)
          .map((q) => ({ id: q.id, label: q.label, maxMarks: Number(q.max_marks), outcomeIds: keep(q.outcome_ids) })),
      })),
    topics: (topics.data ?? [])
      .slice()
      .sort((a, b) => (unitOrder.get(a.unit_id) ?? 0) - (unitOrder.get(b.unit_id) ?? 0) || a.position - b.position)
      .map((t) => ({ id: t.id, title: t.title, unit: unitTitle.get(t.unit_id) ?? "" })),
    topicOutcomes: (topicOutcomes.data ?? []).filter((t) => coIds.has(t.outcome_id)).map((t) => ({ topicId: t.topic_id, outcomeId: t.outcome_id })),
  };
}

export type MarksSummary = Record<string, { rows: number; absent: number; matched: number }>;

/** How many students' marks each test has (and how many are linked to an enrolled student). */
export function marksSummary(rows: { assessment_id: string; absent: boolean; student_id: string | null }[]): MarksSummary {
  const out: MarksSummary = {};
  for (const r of rows) {
    const s = (out[r.assessment_id] ??= { rows: 0, absent: 0, matched: 0 });
    s.rows++;
    if (r.absent) s.absent++;
    if (r.student_id) s.matched++;
  }
  return out;
}

export async function readMarks(db: Db, courseId: string) {
  return all(
    (from, to) =>
      db
        .from("assessment_marks")
        .select("assessment_id, row_key, marks, absent, student_id")
        .eq("course_id", courseId)
        .order("id")
        .range(from, to),
    "assessment_marks",
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The assessments' results per CO, ready for coAttainment. */
export async function courseEvidence(db: Db, data: CourseAccreditationData): Promise<Evidence[]> {
  const courseId = data.course.id;
  const evidence: Evidence[] = [];

  // Assignments mapped to at least one CO.
  const mapped = data.assignments.filter((a) => a.assessment && a.assessment.outcomeIds.length);
  if (mapped.length) {
    const ids = mapped.map((a) => a.id);
    const [submissions, sets] = await Promise.all([
      all(
        (from, to) =>
          db
            .from("submissions")
            .select("id, assignment_id, student_id")
            .in("assignment_id", ids)
            .not("submitted_at", "is", null)
            .order("id")
            .range(from, to),
        "submissions",
      ),
      db.from("assignment_number_sets").select("*").in("assignment_id", ids),
    ]);
    const feedback = new Map<string, unknown>();
    for (const part of chunks(submissions.map((s) => s.id))) {
      const { data: rows, error } = await db.from("feedback_drafts").select("submission_id, criteria").in("submission_id", part).eq("status", "approved");
      if (error) throw new Error(`feedback_drafts: ${error.message}`);
      for (const r of rows ?? []) feedback.set(r.submission_id, r.criteria);
    }
    const setIds = (sets.data ?? []).map((s) => s.assignment_id);
    const answers = setIds.length
      ? await all(
          (from, to) =>
            db
              .from("numeric_answers")
              .select("assignment_id, student_id, answer_value")
              .in("assignment_id", setIds)
              .order("student_id")
              .range(from, to),
          "numeric_answers",
        )
      : [];

    for (const a of mapped) {
      const set = (() => {
        const row = (sets.data ?? []).find((s) => s.assignment_id === a.id);
        return row ? toNumberSet(row) : null;
      })();
      const results: AssignmentResult[] = submissions
        .filter((s) => s.assignment_id === a.id)
        .map((s) => {
          const criteria = storedCriteriaSchema.safeParse(feedback.get(s.id));
          let numbers: AssignmentResult["numbers"] = null;
          if (set) {
            const answer = answers.find((x) => x.assignment_id === a.id && x.student_id === s.student_id);
            const expected = expectedAnswer(set, studentValues(set.variables, { studentId: s.student_id, assignmentId: a.id }));
            if (answer && expected !== null) numbers = checkAnswer(expected, answer.answer_value, set.tolerancePct);
          }
          return {
            student: s.student_id,
            feedback: feedback.has(s.id) && criteria.success ? criteria.data.map((c) => ({ maxPoints: c.maxPoints, points: c.points })) : null,
            numbers,
          };
        });
      const { scores, fromFeedback, fromNumbers } = assignmentScores(results);
      const parts = [
        fromFeedback ? `approved feedback marks (${plural(fromFeedback, "student")})` : "",
        fromNumbers ? `the per-student number check (${plural(fromNumbers, "student")})` : "",
      ].filter(Boolean);
      evidence.push({
        id: a.assessment!.id,
        kind: "assignment",
        title: a.title,
        weight: a.assessment!.weight,
        source: parts.length ? `From ${parts.join(" and ")}` : "No marked feedback or number check on submitted work yet",
        byOutcome: Object.fromEntries(a.assessment!.outcomeIds.map((co) => [co, { scores, detail: "Whole assignment" }])),
        minStudents: 1,
      });
    }
  }

  // Tests and exams with imported marks.
  if (data.tests.length) {
    const marks = await readMarks(db, courseId);
    for (const t of data.tests) {
      const rows = marks
        .filter((m) => m.assessment_id === t.id)
        .map((m) => ({ student: m.row_key, marks: marksInOrder(m.marks, t.questions), absent: m.absent }));
      const absent = rows.filter((r) => r.absent).length;
      evidence.push({
        id: t.id,
        kind: "test",
        title: t.title,
        weight: t.weight,
        source: rows.length
          ? `Marks you imported: ${plural(rows.length, "student")}${absent ? ` (${absent} absent)` : ""}`
          : "No marks imported yet",
        byOutcome: testScoresByOutcome(t.questions, rows),
        minStudents: 1,
      });
    }
  }

  // Students' own practice and mock tests on topics mapped to COs (service role; class counts only).
  if (data.topicOutcomes.length) {
    const topicTitle = new Map(data.topics.map((t) => [t.id, t.title]));
    const topics = data.topicOutcomes.flatMap((t) => (topicTitle.has(t.topicId) ? [{ topic: topicTitle.get(t.topicId)!, outcomeId: t.outcomeId }] : []));
    const admin = createAdminClient();
    const [practice, mock] = await Promise.all([
      all(
        (from, to) =>
          admin
            .from("practice_items")
            .select("id, topic, score, set:practice_sets!inner(student_id, course_id, kind, topic)")
            .eq("practice_sets.course_id", courseId)
            .in("practice_sets.kind", ["practice", "review"])
            .not("score", "is", null)
            .order("id")
            .range(from, to),
        "practice_items",
      ),
      all(
        (from, to) =>
          admin
            .from("mock_test_items")
            .select("id, topic, score, verdict, test:mock_tests!inner(student_id, course_id)")
            .eq("mock_tests.course_id", courseId)
            .not("score", "is", null)
            .neq("verdict", "unchecked")
            .order("id")
            .range(from, to),
        "mock_test_items",
      ),
    ]);
    const practiceItems: SelfStudyItem[] = practice.flatMap((i) => {
      const set = Array.isArray(i.set) ? i.set[0] : i.set;
      return set && i.score !== null ? [{ student: set.student_id, topic: i.topic || set.topic, score: Number(i.score) }] : [];
    });
    const mockItems: SelfStudyItem[] = mock.flatMap((i) => {
      const test = Array.isArray(i.test) ? i.test[0] : i.test;
      return test && i.score !== null && i.topic ? [{ student: test.student_id, topic: i.topic, score: Number(i.score) }] : [];
    });
    evidence.push(
      {
        id: "practice",
        kind: "practice",
        title: "Practice (students' own)",
        weight: data.settings.practiceWeight,
        source: `Graded "Practice this" and review items on mapped topics; counted only with ${SELF_STUDY_MIN_STUDENTS}+ students`,
        byOutcome: selfStudyScoresByOutcome(practiceItems, topics),
        minStudents: SELF_STUDY_MIN_STUDENTS,
      },
      {
        id: "mock",
        kind: "mock",
        title: "Mock tests (students' own)",
        weight: data.settings.mockWeight,
        source: `Marked mock-test questions on mapped topics; counted only with ${SELF_STUDY_MIN_STUDENTS}+ students`,
        byOutcome: selfStudyScoresByOutcome(mockItems, topics),
        minStudents: SELF_STUDY_MIN_STUDENTS,
      },
    );
  }
  return evidence;
}

export type CourseAttainment = {
  data: CourseAccreditationData;
  evidence: Evidence[];
  co: CoResult[];
  po: PoResult[];
  assessments: AssessmentSummary[];
};

export async function courseAttainment(db: Db, course: AccreditationCourse): Promise<CourseAttainment> {
  const data = await readCourseAccreditation(db, course);
  const evidence = await courseEvidence(db, data);
  const co = coAttainment(data.outcomes, evidence, data.settings);
  const po = poAttainment(co, data.mappings, data.programOutcomes);
  const code = new Map(data.outcomes.map((o) => [o.id, o.code]));
  const assessments: AssessmentSummary[] = evidence.map((e) => ({
    title: e.title,
    kind: e.kind,
    outcomeCodes: Object.keys(e.byOutcome).flatMap((id) => (code.has(id) ? [code.get(id)!] : [])),
    weight: e.weight,
    source: e.source,
  }));
  return { data, evidence, co, po, assessments };
}

async function names(courseTeacherIds: string[], institutionId: string | null) {
  const admin = createAdminClient();
  const [teachers, institution] = await Promise.all([
    courseTeacherIds.length ? admin.from("profiles").select("id, full_name").in("id", courseTeacherIds) : Promise.resolve({ data: [] }),
    institutionId ? admin.from("institutions").select("name, city").eq("id", institutionId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const inst = institution.data as { name: string; city: string } | null;
  return {
    teacher: new Map(((teachers.data ?? []) as { id: string; full_name: string }[]).map((t) => [t.id, t.full_name])),
    institution: inst ? [inst.name, inst.city].filter(Boolean).join(", ") : "",
  };
}

/** The course report (PDF / Excel model). */
export async function courseReport(db: Db, course: AccreditationCourse, now = new Date()): Promise<{ doc: ReportDoc; result: CourseAttainment }> {
  const result = await courseAttainment(db, course);
  const n = await names([course.teacherId], course.institutionId ?? result.data.program?.institutionId ?? null);
  const { data } = result;
  const doc = buildCourseReport({
    institution: n.institution,
    course: { name: course.name, code: course.code },
    teacher: n.teacher.get(course.teacherId) ?? "",
    program: data.program ? { name: data.program.name, department: data.program.department } : null,
    settings: data.settings,
    outcomes: data.outcomes,
    programOutcomes: data.programOutcomes,
    mappings: data.mappings,
    assessments: result.assessments,
    co: result.co,
    po: result.po,
    generatedAt: now,
  });
  return { doc, result };
}

// ---------------------------------------------------------------- programmes

/** Whether the user may edit the programme (they made it, or they are an admin of its institution). */
export function canManageProgram(program: ProgramSummary, user: { id: string; role: string }, institutionId: string | null) {
  return program.createdBy === user.id || (user.role === "admin" && program.institutionId !== null && program.institutionId === institutionId);
}

export async function myInstitutionId(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("institution_id").eq("id", userId).maybeSingle();
  return data?.institution_id ?? null;
}

/** Programmes the signed-in teacher can see (theirs and their institution's), with outcome counts. */
export async function listPrograms(db: Db) {
  const [programs, outcomes] = await Promise.all([
    db.from("programs").select("id, name, department, institution_id, created_by").order("name"),
    db.from("program_outcomes").select("program_id, kind"),
  ]);
  if (programs.error) throw new Error(`programs: ${programs.error.message}`);
  return (programs.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    department: p.department,
    institutionId: p.institution_id,
    createdBy: p.created_by,
    pos: (outcomes.data ?? []).filter((o) => o.program_id === p.id && o.kind === "po").length,
    psos: (outcomes.data ?? []).filter((o) => o.program_id === p.id && o.kind === "pso").length,
  }));
}

/** A programme the user can read (RLS), with its outcomes. */
export async function readProgram(db: Db, programId: string) {
  const [p, pos] = await Promise.all([
    db.from("programs").select("id, name, department, institution_id, created_by").eq("id", programId).maybeSingle(),
    db.from("program_outcomes").select("id, kind, code, title, description").eq("program_id", programId),
  ]);
  if (!p.data) return null;
  return {
    program: { id: p.data.id, name: p.data.name, department: p.data.department, institutionId: p.data.institution_id, createdBy: p.data.created_by } as ProgramSummary,
    outcomes: sortProgramOutcomes(
      (pos.data ?? []).map((o) => ({ id: o.id, kind: o.kind === "pso" ? ("pso" as const) : ("po" as const), code: o.code, title: o.title, description: o.description })),
    ),
  };
}

export type ProgramCourseRow = ProgramCourseSummary & { courseId: string; mine: boolean; mapped: number };

/**
 * Every course in the programme with its PO values, and the programme's PO
 * attainment. Read with the service role: call only after readProgram (RLS)
 * proved the viewer may see the programme. Only aggregates leave here.
 */
export async function programAttainmentData(programId: string, viewerId: string) {
  const admin = createAdminClient();
  const { data: links, error } = await admin
    .from("course_programs")
    .select("course:courses!inner(id, name, code, teacher_id, institution_id)")
    .eq("program_id", programId);
  if (error) throw new Error(`course_programs: ${error.message}`);
  const courses = (links ?? [])
    .map((l) => (Array.isArray(l.course) ? l.course[0] : l.course))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({ id: c.id, name: c.name, code: c.code, teacherId: c.teacher_id, institutionId: c.institution_id }))
    .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));

  const results = await Promise.all(courses.map((c) => courseAttainment(admin, c)));
  const n = await names(
    [...new Set(courses.map((c) => c.teacherId))],
    null,
  );
  const rows: ProgramCourseRow[] = results.map((r, i) => {
    const c = courses[i];
    return {
      courseId: c.id,
      mine: c.teacherId === viewerId,
      label: c.code ? `${c.code} ${c.name}` : c.name,
      teacher: n.teacher.get(c.teacherId) ?? "",
      academicYear: r.data.settings.academicYear,
      outcomes: r.data.outcomes.length,
      assessed: r.co.filter((x) => x.level !== null).length,
      met: r.co.filter((x) => x.met).length,
      mapped: r.data.mappings.length,
      values: Object.fromEntries(r.po.map((p) => [p.outcome.id, p.value])),
    };
  });
  return rows;
}

export async function programReport(
  program: ProgramSummary,
  outcomes: ProgramOutcome[],
  rows: ProgramCourseRow[],
  now = new Date(),
): Promise<{ doc: ReportDoc; results: ProgramPoResult[] }> {
  const results = programAttainment(
    outcomes,
    rows.map((r) => ({ courseId: r.courseId, label: r.label, values: r.values })),
  );
  const n = await names([], program.institutionId);
  const doc = buildProgramReport({
    institution: n.institution,
    program: { name: program.name, department: program.department },
    programOutcomes: outcomes,
    courses: rows,
    results,
    generatedAt: now,
  });
  return { doc, results };
}
