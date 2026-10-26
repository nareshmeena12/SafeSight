"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { textToOutcomes, LIMITS } from "@/lib/setup/topic-map";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accreditationCourse, myInstitutionId } from "./data";
import { parseMarks, rowKey, type MarksIssue } from "./marks";
import { NBA_ENGINEERING_POS, poKind } from "./outcomes";
import {
  assignmentMappingSchema,
  createProgramSchema,
  importMarksSchema,
  linkProgramSchema,
  matrixSchema,
  outcomesFormSchema,
  saveProgramSchema,
  settingsSchema,
  testSchema,
  topicOutcomesSchema,
} from "./schemas";

/**
 * Accreditation server actions (S24). Each checks the role, validates with
 * zod and writes with the teacher's own Supabase client, so row-level
 * security decides what may change (the course teacher for course data; the
 * programme's maker or an institution admin for programmes).
 */

export type ActionResult = { status: "success" | "error"; message: string };

const tryAgain = "That didn't save. Please try again in a moment.";
const notYours = "Only this course's teacher can change this.";
const ok = (message: string): ActionResult => ({ status: "success", message });
const fail = (message: string = tryAgain): ActionResult => ({ status: "error", message });

async function owner(courseId: string) {
  const user = await requireRole(["teacher", "admin"]);
  const db = await createClient();
  const course = await accreditationCourse(db, user.id, courseId);
  return course ? { user, db, course } : null;
}

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? tryAgain;
}

async function courseOutcomeIds(db: Awaited<ReturnType<typeof createClient>>, courseId: string) {
  const { data } = await db.from("course_outcomes").select("id").eq("course_id", courseId);
  return new Set((data ?? []).map((o) => o.id));
}

// ---------------------------------------------------------------- course outcomes

/** Saves "CO1: …" lines. COs that keep their code keep their id, so mappings survive edits. */
export async function saveCourseOutcomes(input: { courseId: string; text: string }): Promise<ActionResult> {
  const parsed = outcomesFormSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await owner(parsed.data.courseId);
  if (!ctx) return fail(notYours);
  const { db, course } = ctx;
  if (parsed.data.text.split("\n").filter((l) => l.trim()).length > LIMITS.outcomes) {
    return fail(`Keep it to ${LIMITS.outcomes} course outcomes.`);
  }
  const next = textToOutcomes(parsed.data.text);
  const { data: saved, error } = await db.from("course_outcomes").select("id, code").eq("course_id", course.id);
  if (error) return fail();
  const byCode = new Map((saved ?? []).map((o) => [o.code.toUpperCase(), o.id]));
  const keep = new Set<string>();
  const updates: { id: string; code: string; description: string; position: number }[] = [];
  const inserts: { course_id: string; code: string; description: string; position: number }[] = [];
  next.forEach((o, position) => {
    const id = byCode.get(o.code.toUpperCase());
    if (id && !keep.has(id)) {
      keep.add(id);
      updates.push({ id, code: o.code, description: o.description, position });
    } else inserts.push({ course_id: course.id, code: o.code, description: o.description, position });
  });
  const removed = (saved ?? []).filter((o) => !keep.has(o.id)).map((o) => o.id);
  if (removed.length) {
    const del = await db.from("course_outcomes").delete().in("id", removed);
    if (del.error) return fail();
  }
  for (const u of updates) {
    const up = await db.from("course_outcomes").update({ code: u.code, description: u.description, position: u.position }).eq("id", u.id);
    if (up.error) return fail();
  }
  if (inserts.length) {
    const ins = await db.from("course_outcomes").insert(inserts);
    if (ins.error) return fail();
  }
  refresh();
  return ok(next.length ? `${next.length} course ${next.length === 1 ? "outcome" : "outcomes"} saved.` : "Course outcomes cleared.");
}

// ---------------------------------------------------------------- programme link and matrix

export async function linkProgram(input: { courseId: string; programId: string }): Promise<ActionResult> {
  const parsed = linkProgramSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await owner(parsed.data.courseId);
  if (!ctx) return fail(notYours);
  const { db, course, user } = ctx;
  const { data: current } = await db.from("course_programs").select("program_id").eq("course_id", course.id).maybeSingle();
  const programId = parsed.data.programId;
  if ((current?.program_id ?? "") === programId) return ok("Nothing to change.");

  // Mappings belong to one programme's POs: a new programme starts a new matrix.
  const clear = await db.from("co_po_mappings").delete().eq("course_id", course.id);
  if (clear.error) return fail();
  if (!programId) {
    const del = await db.from("course_programs").delete().eq("course_id", course.id);
    if (del.error) return fail();
    refresh();
    return ok("This course is no longer linked to a programme.");
  }
  const { data: program } = await db.from("programs").select("id, name").eq("id", programId).maybeSingle();
  if (!program) return fail("That programme isn't available to you.");
  const { error } = await db
    .from("course_programs")
    .upsert({ course_id: course.id, program_id: program.id, linked_by: user.id, created_at: new Date().toISOString() }, { onConflict: "course_id" });
  if (error) return fail();
  refresh();
  return ok(`Linked to ${program.name}.`);
}

export async function saveMatrix(input: {
  courseId: string;
  cells: { outcomeId: string; programOutcomeId: string; level: number; justification?: string }[];
}): Promise<ActionResult> {
  const parsed = matrixSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await owner(parsed.data.courseId);
  if (!ctx) return fail(notYours);
  const { db, course } = ctx;
  const { data: link } = await db.from("course_programs").select("program_id").eq("course_id", course.id).maybeSingle();
  if (!link) return fail("Link the course to a programme first.");
  const [cos, pos, existing] = await Promise.all([
    courseOutcomeIds(db, course.id),
    db.from("program_outcomes").select("id").eq("program_id", link.program_id),
    db.from("co_po_mappings").select("outcome_id, program_outcome_id").eq("course_id", course.id),
  ]);
  const poIds = new Set((pos.data ?? []).map((p) => p.id));
  const cells = parsed.data.cells.filter((c) => cos.has(c.outcomeId) && poIds.has(c.programOutcomeId));
  const now = new Date().toISOString();
  if (cells.length) {
    const { error } = await db.from("co_po_mappings").upsert(
      cells.map((c) => ({
        course_id: course.id,
        outcome_id: c.outcomeId,
        program_outcome_id: c.programOutcomeId,
        level: c.level,
        justification: c.justification,
        updated_at: now,
      })),
      { onConflict: "outcome_id,program_outcome_id" },
    );
    if (error) {
      console.error("co_po_mappings:", error.message);
      return fail();
    }
  }
  const keep = new Set(cells.map((c) => `${c.outcomeId}:${c.programOutcomeId}`));
  const removed = (existing.data ?? []).filter((m) => !keep.has(`${m.outcome_id}:${m.program_outcome_id}`));
  for (const m of removed) {
    const del = await db.from("co_po_mappings").delete().eq("outcome_id", m.outcome_id).eq("program_outcome_id", m.program_outcome_id);
    if (del.error) return fail();
  }
  refresh();
  return ok(`Mapping saved: ${cells.length} ${cells.length === 1 ? "cell" : "cells"} filled.`);
}

// ---------------------------------------------------------------- programmes

export async function createProgram(input: { name: string; department: string; template: "nba" | "empty" }): Promise<
  ActionResult & { programId?: string }
> {
  const user = await requireRole(["teacher", "admin"]);
  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const db = await createClient();
  const institutionId = await myInstitutionId(db, user.id);
  const { data: program, error } = await db
    .from("programs")
    .insert({ name: parsed.data.name, department: parsed.data.department, institution_id: institutionId, created_by: user.id })
    .select("id")
    .single();
  if (error || !program) {
    console.error("programs:", error?.message);
    return fail();
  }
  if (parsed.data.template === "nba") {
    const { error: posError } = await db.from("program_outcomes").insert(
      NBA_ENGINEERING_POS.map((p, position) => ({ program_id: program.id, kind: "po", position, code: p.code, title: p.title, description: p.description })),
    );
    if (posError) console.error("program_outcomes:", posError.message);
  }
  refresh();
  return { ...ok("Programme created."), programId: program.id };
}

export async function saveProgram(input: {
  programId: string;
  name: string;
  department: string;
  outcomes: { id?: string; code: string; title: string; description: string }[];
}): Promise<ActionResult> {
  await requireRole(["teacher", "admin"]);
  const parsed = saveProgramSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const db = await createClient();
  const { programId, name, department, outcomes } = parsed.data;
  const { data: updated, error } = await db
    .from("programs")
    .update({ name, department, updated_at: new Date().toISOString() })
    .eq("id", programId)
    .select("id");
  if (error) return fail();
  if (!updated?.length) return fail("Only the teacher who made this programme, or an admin, can change it.");

  const { data: saved } = await db.from("program_outcomes").select("id").eq("program_id", programId);
  const savedIds = new Set((saved ?? []).map((o) => o.id));
  const keep = new Set<string>();
  const rows = outcomes.map((o, position) => {
    const id = o.id && savedIds.has(o.id) && !keep.has(o.id) ? o.id : undefined;
    if (id) keep.add(id);
    return { id, code: o.code, title: o.title, description: o.description, position, kind: poKind(o.code) };
  });
  const removed = [...savedIds].filter((id) => !keep.has(id));
  if (removed.length) {
    const del = await db.from("program_outcomes").delete().in("id", removed);
    if (del.error) return fail();
  }
  // Codes are unique per programme: park the kept rows on temporary codes first, so PO3 ↔ PO4 swaps work.
  const kept = rows.filter((r) => r.id);
  for (const [i, r] of kept.entries()) {
    const up = await db.from("program_outcomes").update({ code: `~${i}` }).eq("id", r.id!);
    if (up.error) return fail();
  }
  for (const r of kept) {
    const up = await db
      .from("program_outcomes")
      .update({ code: r.code, title: r.title, description: r.description, position: r.position, kind: r.kind })
      .eq("id", r.id!);
    if (up.error) return fail();
  }
  const fresh = rows.filter((r) => !r.id);
  if (fresh.length) {
    const ins = await db
      .from("program_outcomes")
      .insert(fresh.map((r) => ({ program_id: programId, code: r.code, title: r.title, description: r.description, position: r.position, kind: r.kind })));
    if (ins.error) return fail();
  }
  refresh();
  return ok("Programme saved.");
}

export async function deleteProgram(input: { programId: string }): Promise<ActionResult> {
  await requireRole(["teacher", "admin"]);
  const db = await createClient();
  const { data, error } = await db.from("programs").delete().eq("id", input.programId).select("id");
  if (error) return fail();
  if (!data?.length) return fail("Only the teacher who made this programme, or an admin, can delete it.");
  refresh();
  return ok("Programme deleted.");
}

// ---------------------------------------------------------------- assessments

export async function saveAssignmentMapping(input: {
  courseId: string;
  assignmentId: string;
  include: boolean;
  outcomeIds: string[];
  weight: number;
}): Promise<ActionResult> {
  const parsed = assignmentMappingSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await owner(parsed.data.courseId);
  if (!ctx) return fail(notYours);
  const { db, course } = ctx;
  const { data: assignment } = await db
    .from("assignments")
    .select("id, title")
    .eq("id", parsed.data.assignmentId)
    .eq("course_id", course.id)
    .maybeSingle();
  if (!assignment) return fail("That assignment isn't in this course.");
  if (!parsed.data.include) {
    const del = await db.from("course_assessments").delete().eq("assignment_id", assignment.id);
    if (del.error) return fail();
    refresh();
    return ok(`${assignment.title} no longer counts towards CO attainment.`);
  }
  const cos = await courseOutcomeIds(db, course.id);
  const { error } = await db.from("course_assessments").upsert(
    {
      course_id: course.id,
      kind: "assignment",
      assignment_id: assignment.id,
      title: assignment.title.slice(0, 200),
      weight: parsed.data.weight,
      outcome_ids: [...new Set(parsed.data.outcomeIds)].filter((id) => cos.has(id)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "assignment_id" },
  );
  if (error) {
    console.error("course_assessments:", error.message);
    return fail();
  }
  refresh();
  return ok(`${assignment.title} saved.`);
}

export async function saveTest(input: {
  courseId: string;
  testId?: string;
  title: string;
  heldOn?: string;
  weight: number;
  questions: { id?: string; label: string; maxMarks: number; outcomeIds: string[] }[];
}): Promise<ActionResult & { testId?: string }> {
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await owner(parsed.data.courseId);
  if (!ctx) return fail(notYours);
  const { db, course } = ctx;
  const cos = await courseOutcomeIds(db, course.id);
  const { title, heldOn, weight, questions } = parsed.data;
  const now = new Date().toISOString();

  let testId = parsed.data.testId;
  if (testId) {
    const { data, error } = await db
      .from("course_assessments")
      .update({ title, held_on: heldOn || null, weight, updated_at: now })
      .eq("id", testId)
      .eq("course_id", course.id)
      .eq("kind", "test")
      .select("id");
    if (error || !data?.length) return fail();
  } else {
    const { data, error } = await db
      .from("course_assessments")
      .insert({ course_id: course.id, kind: "test", title, held_on: heldOn || null, weight })
      .select("id")
      .single();
    if (error || !data) {
      console.error("course_assessments:", error?.message);
      return fail();
    }
    testId = data.id;
  }

  const { data: saved } = await db.from("assessment_questions").select("id").eq("assessment_id", testId);
  const savedIds = new Set((saved ?? []).map((q) => q.id));
  const keep = new Set<string>();
  const rows = questions.map((q, position) => {
    const id = q.id && savedIds.has(q.id) && !keep.has(q.id) ? q.id : undefined;
    if (id) keep.add(id);
    return { id, label: q.label, max_marks: q.maxMarks, outcome_ids: [...new Set(q.outcomeIds)].filter((x) => cos.has(x)), position };
  });
  const removed = [...savedIds].filter((id) => !keep.has(id));
  if (removed.length) {
    const del = await db.from("assessment_questions").delete().in("id", removed);
    if (del.error) return fail();
  }
  // Positions are unique per test: move kept rows out of the way first (questions ≤ 40, so 50+ is free).
  const kept = rows.filter((r) => r.id);
  for (const [i, r] of kept.entries()) {
    const up = await db.from("assessment_questions").update({ position: 50 + i }).eq("id", r.id!);
    if (up.error) return fail();
  }
  for (const r of kept) {
    const up = await db
      .from("assessment_questions")
      .update({ label: r.label, max_marks: r.max_marks, outcome_ids: r.outcome_ids, position: r.position })
      .eq("id", r.id!);
    if (up.error) return fail();
  }
  const fresh = rows.filter((r) => !r.id);
  if (fresh.length) {
    const ins = await db.from("assessment_questions").insert(
      fresh.map((r) => ({
        assessment_id: testId!,
        course_id: course.id,
        label: r.label,
        max_marks: r.max_marks,
        outcome_ids: r.outcome_ids,
        position: r.position,
      })),
    );
    if (ins.error) {
      console.error("assessment_questions:", ins.error.message);
      return fail();
    }
  }
  refresh();
  return { ...ok(`${title} saved.`), testId };
}

export async function deleteTest(input: { courseId: string; testId: string }): Promise<ActionResult> {
  const ctx = await owner(input.courseId);
  if (!ctx) return fail(notYours);
  const { data, error } = await ctx.db
    .from("course_assessments")
    .delete()
    .eq("id", input.testId)
    .eq("course_id", ctx.course.id)
    .eq("kind", "test")
    .select("id");
  if (error || !data?.length) return fail();
  refresh();
  return ok("Test removed, with its marks.");
}

export type ImportMarksResult = ActionResult & {
  imported?: number;
  matched?: number;
  unmatched?: string[];
  errors?: MarksIssue[];
  warnings?: MarksIssue[];
};

/** Replaces a test's marks with the file's. Rows are linked to enrolled students by roll number or email. */
export async function importMarks(input: { courseId: string; testId: string; text: string }): Promise<ImportMarksResult> {
  const parsed = importMarksSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await owner(parsed.data.courseId);
  if (!ctx) return fail(notYours);
  const { db, course } = ctx;
  const [{ data: test }, { data: questions }] = await Promise.all([
    db.from("course_assessments").select("id, title").eq("id", parsed.data.testId).eq("course_id", course.id).eq("kind", "test").maybeSingle(),
    db.from("assessment_questions").select("id, label, max_marks").eq("assessment_id", parsed.data.testId).order("position"),
  ]);
  if (!test) return fail("That test isn't in this course.");
  if (!questions?.length) return fail("Add the test's questions first.");
  const qs = questions.map((q) => ({ id: q.id, label: q.label, maxMarks: Number(q.max_marks) }));
  const result = parseMarks(parsed.data.text, qs);
  if (!result.rows.length) {
    return { ...fail(result.errors[0]?.message ?? "No marks were found in that file."), errors: result.errors, warnings: result.warnings };
  }

  // Link rows to enrolled students: by roll number, else by email.
  const { data: roster } = await db.from("enrollments").select("student_id, student:profiles(roll_number)").eq("course_id", course.id);
  const enrolled = new Set((roster ?? []).map((r) => r.student_id));
  const byRoll = new Map<string, string>();
  for (const r of roster ?? []) {
    const student = Array.isArray(r.student) ? r.student[0] : r.student;
    if (student?.roll_number) byRoll.set(student.roll_number.toUpperCase(), r.student_id);
  }
  const emails = [...new Set(result.rows.flatMap((r) => (r.email ? [r.email] : [])))];
  const byEmail = new Map<string, string>();
  if (emails.length) {
    const { data: found } = await createAdminClient().rpc("profiles_by_email", { p_emails: emails });
    for (const f of found ?? []) if (enrolled.has(f.id)) byEmail.set(f.email, f.id);
  }

  const rows = result.rows.map((r) => {
    const studentId = (r.rollNumber && byRoll.get(r.rollNumber)) || (r.email && byEmail.get(r.email)) || null;
    const marks: Record<string, number> = {};
    r.marks.forEach((m, i) => {
      if (m !== null) marks[qs[i].id] = m;
    });
    return {
      assessment_id: test.id,
      course_id: course.id,
      row_key: rowKey(r)!,
      roll_number: r.rollNumber,
      email: r.email,
      student_name: r.name,
      student_id: studentId,
      marks,
      absent: r.absent,
    };
  });

  const del = await db.from("assessment_marks").delete().eq("assessment_id", test.id);
  if (del.error) return fail();
  for (let i = 0; i < rows.length; i += 300) {
    const ins = await db.from("assessment_marks").insert(rows.slice(i, i + 300));
    if (ins.error) {
      console.error("assessment_marks:", ins.error.message);
      return fail("Some marks didn't save. Please import the file again.");
    }
  }
  const matched = rows.filter((r) => r.student_id).length;
  refresh();
  return {
    ...ok(`Imported marks for ${rows.length} ${rows.length === 1 ? "student" : "students"}.`),
    imported: rows.length,
    matched,
    unmatched: rows.filter((r) => !r.student_id).map((r) => r.row_key).slice(0, 20),
    errors: result.errors,
    warnings: result.warnings,
  };
}

export async function clearMarks(input: { courseId: string; testId: string }): Promise<ActionResult> {
  const ctx = await owner(input.courseId);
  if (!ctx) return fail(notYours);
  const { error } = await ctx.db.from("assessment_marks").delete().eq("assessment_id", input.testId).eq("course_id", ctx.course.id);
  if (error) return fail();
  refresh();
  return ok("Marks cleared.");
}

export async function saveTopicOutcomes(input: { courseId: string; pairs: { topicId: string; outcomeId: string }[] }): Promise<ActionResult> {
  const parsed = topicOutcomesSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await owner(parsed.data.courseId);
  if (!ctx) return fail(notYours);
  const { db, course } = ctx;
  const [cos, topics] = await Promise.all([
    courseOutcomeIds(db, course.id),
    db.from("course_topics").select("id").eq("course_id", course.id),
  ]);
  const topicIds = new Set((topics.data ?? []).map((t) => t.id));
  const pairs = [...new Map(parsed.data.pairs.filter((p) => cos.has(p.outcomeId) && topicIds.has(p.topicId)).map((p) => [`${p.topicId}:${p.outcomeId}`, p])).values()];
  const del = await db.from("course_topic_outcomes").delete().eq("course_id", course.id);
  if (del.error) return fail();
  if (pairs.length) {
    const ins = await db.from("course_topic_outcomes").insert(pairs.map((p) => ({ course_id: course.id, topic_id: p.topicId, outcome_id: p.outcomeId })));
    if (ins.error) return fail();
  }
  refresh();
  return ok(`Topics mapped to course outcomes (${pairs.length} ${pairs.length === 1 ? "link" : "links"}).`);
}

export async function saveAttainmentSettings(input: Record<string, unknown>): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await owner(parsed.data.courseId);
  if (!ctx) return fail(notYours);
  const s = parsed.data;
  const { error } = await ctx.db.from("course_attainment_settings").upsert(
    {
      course_id: ctx.course.id,
      target_pct: s.targetPct,
      level1_pct: s.level1Pct,
      level2_pct: s.level2Pct,
      level3_pct: s.level3Pct,
      target_level: s.targetLevel,
      practice_weight: s.practiceWeight,
      mock_weight: s.mockWeight,
      academic_year: s.academicYear,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "course_id" },
  );
  if (error) return fail();
  refresh();
  return ok("Settings saved. The report uses them straight away.");
}
