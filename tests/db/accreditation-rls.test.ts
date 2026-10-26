/**
 * Row-level security for S24's tables: programs, program_outcomes,
 * course_programs, co_po_mappings, course_attainment_settings,
 * course_assessments, assessment_questions, assessment_marks and
 * course_topic_outcomes. Runs against local Supabase; skipped when it is not
 * running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
if (!env) console.warn("Skipping accreditation RLS tests: local Supabase is not running (pnpm db:start).");

const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);
const emailFor = (key: string) => `accr-${key}-${run}@test.safesight.in`;

describe.skipIf(!env)("accreditation RLS", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let instA: string;
  let instB: string;
  let courseId: string;
  let otherCourseId: string;
  let otherAssignmentId: string;
  let assignmentId: string;
  let programId: string;
  let otherProgramId: string;
  let po1: string;
  let otherPo: string;
  let co1: string;
  let topicId: string;
  let testId: string;

  async function makeUser(key: string, role: "student" | "teacher" | "admin", institutionId: string | null) {
    const { data, error } = await admin.auth.admin.createUser({
      email: emailFor(key),
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${key}` },
    });
    if (error) throw error;
    ids[key] = data.user.id;
    const { error: roleError } = await admin.from("profiles").update({ role, institution_id: institutionId }).eq("id", data.user.id);
    if (roleError) throw roleError;
    const client = createClient(env!.url, env!.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email: emailFor(key), password });
    if (signInError) throw signInError;
    clients[key] = client;
  }

  async function insert<T = { id: string }>(table: string, row: object): Promise<T> {
    const { data, error } = await admin.from(table).insert(row).select().single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as T;
  }

  beforeAll(async () => {
    admin = createClient(env!.url, env!.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    instA = (await insert("institutions", { name: `Accr A ${run}` })).id;
    instB = (await insert("institutions", { name: `Accr B ${run}` })).id;
    await makeUser("teacher", "teacher", instA);
    await makeUser("colleague", "teacher", instA);
    await makeUser("instAdmin", "admin", instA);
    await makeUser("outsider", "teacher", instB);
    await makeUser("student", "student", instA);
    await makeUser("classmate", "student", instA);

    courseId = (await insert("courses", { teacher_id: ids.teacher, institution_id: instA, name: "Accreditation course" })).id;
    otherCourseId = (await insert("courses", { teacher_id: ids.colleague, institution_id: instA, name: "Colleague course" })).id;
    assignmentId = (await insert("assignments", { course_id: courseId, title: "Problem set 1" })).id;
    otherAssignmentId = (await insert("assignments", { course_id: otherCourseId, title: "Other set" })).id;
    const { error } = await admin.from("enrollments").insert([
      { course_id: courseId, student_id: ids.student },
      { course_id: courseId, student_id: ids.classmate },
    ]);
    if (error) throw error;
    co1 = (await insert("course_outcomes", { course_id: courseId, position: 0, code: "CO1", description: "Apply the first law" })).id;
    const unit = await insert("course_units", { course_id: courseId, position: 0, title: "Basics" });
    topicId = (await insert("course_topics", { course_id: courseId, unit_id: unit.id, position: 0, title: "Entropy" })).id;
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    await admin.from("programs").delete().in("id", [programId, otherProgramId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
    await admin.from("institutions").delete().in("id", [instA, instB].filter(Boolean));
  });

  it("a teacher creates a programme in their own institution only", async () => {
    const wrong = await clients.teacher.from("programs").insert({ name: "B.Tech X", institution_id: instB, created_by: ids.teacher });
    expect(wrong.error).not.toBeNull();
    const someoneElse = await clients.teacher.from("programs").insert({ name: "B.Tech X", institution_id: instA, created_by: ids.colleague });
    expect(someoneElse.error).not.toBeNull();
    const student = await clients.student.from("programs").insert({ name: "B.Tech X", institution_id: instA, created_by: ids.student });
    expect(student.error).not.toBeNull();

    const own = await clients.teacher
      .from("programs")
      .insert({ name: "B.Tech Mechanical", department: "Mechanical", institution_id: instA, created_by: ids.teacher })
      .select("id")
      .single();
    expect(own.error).toBeNull();
    programId = own.data!.id;
    const pos = await clients.teacher
      .from("program_outcomes")
      .insert({ program_id: programId, kind: "po", position: 0, code: "PO1", description: "Engineering knowledge" })
      .select("id")
      .single();
    expect(pos.error).toBeNull();
    po1 = pos.data!.id;

    otherProgramId = (await insert("programs", { name: "B.Sc Physics", institution_id: instB, created_by: ids.outsider })).id;
    otherPo = (await insert("program_outcomes", { program_id: otherProgramId, kind: "po", position: 0, code: "PO1", description: "Physics" })).id;
  });

  it("teachers of the institution read a programme; other institutions and students don't", async () => {
    for (const key of ["teacher", "colleague", "instAdmin"]) {
      const { data } = await clients[key].from("programs").select("id").eq("id", programId);
      expect(data, key).toHaveLength(1);
      const outcomes = await clients[key].from("program_outcomes").select("id").eq("program_id", programId);
      expect(outcomes.data, key).toHaveLength(1);
    }
    for (const key of ["outsider", "student"]) {
      const { data } = await clients[key].from("programs").select("id").eq("id", programId);
      expect(data, key).toEqual([]);
      const outcomes = await clients[key].from("program_outcomes").select("id").eq("program_id", programId);
      expect(outcomes.data, key).toEqual([]);
    }
    const { data: other } = await clients.teacher.from("programs").select("id").eq("id", otherProgramId);
    expect(other).toEqual([]);
  });

  it("only the maker or an institution admin changes a programme and its outcomes", async () => {
    const colleague = await clients.colleague.from("programs").update({ name: "Renamed" }).eq("id", programId).select("id");
    expect(colleague.data).toEqual([]);
    const colleaguePo = await clients.colleague.from("program_outcomes").insert({ program_id: programId, kind: "po", position: 1, code: "PO2", description: "x" });
    expect(colleaguePo.error).not.toBeNull();
    const colleagueDelete = await clients.colleague.from("programs").delete().eq("id", programId).select("id");
    expect(colleagueDelete.data).toEqual([]);

    const adminUpdate = await clients.instAdmin.from("programs").update({ department: "Mechanical Engineering" }).eq("id", programId).select("id");
    expect(adminUpdate.data).toHaveLength(1);
    const adminPo = await clients.instAdmin.from("program_outcomes").update({ title: "Engineering knowledge" }).eq("id", po1).select("id");
    expect(adminPo.data).toHaveLength(1);
    // Nobody moves a programme into another institution.
    const move = await clients.teacher.from("programs").update({ institution_id: instB }).eq("id", programId);
    expect(move.error).not.toBeNull();
  });

  it("a course teacher links their course to a programme they can read", async () => {
    const unreadable = await clients.teacher.from("course_programs").insert({ course_id: courseId, program_id: otherProgramId });
    expect(unreadable.error).not.toBeNull();
    const notTheirs = await clients.colleague.from("course_programs").insert({ course_id: courseId, program_id: programId });
    expect(notTheirs.error).not.toBeNull();
    const own = await clients.teacher.from("course_programs").insert({ course_id: courseId, program_id: programId, linked_by: ids.teacher });
    expect(own.error).toBeNull();
    // Readers of the programme see which courses are in it; other institutions don't.
    const colleague = await clients.colleague.from("course_programs").select("course_id").eq("program_id", programId);
    expect(colleague.data).toEqual([{ course_id: courseId }]);
    const outsider = await clients.outsider.from("course_programs").select("course_id");
    expect(outsider.data).toEqual([]);
  });

  it("the CO–PO matrix: only the course teacher, only POs of the linked programme", async () => {
    const otherProgramme = await clients.teacher
      .from("co_po_mappings")
      .insert({ course_id: courseId, outcome_id: co1, program_outcome_id: otherPo, level: 3 });
    expect(otherProgramme.error).not.toBeNull();
    const colleague = await clients.colleague.from("co_po_mappings").insert({ course_id: courseId, outcome_id: co1, program_outcome_id: po1, level: 3 });
    expect(colleague.error).not.toBeNull();
    // A CO of one course can't be filed under another.
    const wrongCourse = await clients.colleague.from("co_po_mappings").insert({ course_id: otherCourseId, outcome_id: co1, program_outcome_id: po1, level: 3 });
    expect(wrongCourse.error).not.toBeNull();
    const own = await clients.teacher.from("co_po_mappings").insert({ course_id: courseId, outcome_id: co1, program_outcome_id: po1, level: 3 });
    expect(own.error).toBeNull();
    const bad = await clients.teacher.from("co_po_mappings").upsert({ course_id: courseId, outcome_id: co1, program_outcome_id: po1, level: 4 });
    expect(bad.error).not.toBeNull();
    for (const key of ["colleague", "student", "outsider"]) {
      const { data } = await clients[key].from("co_po_mappings").select("outcome_id");
      expect(data, key).toEqual([]);
    }
  });

  it("settings and topic ↔ CO links are the course teacher's only", async () => {
    const own = await clients.teacher.from("course_attainment_settings").insert({ course_id: courseId, target_pct: 50 });
    expect(own.error).toBeNull();
    const badLevels = await clients.teacher.from("course_attainment_settings").update({ level1_pct: 80 }).eq("course_id", courseId);
    expect(badLevels.error).not.toBeNull();
    const colleague = await clients.colleague.from("course_attainment_settings").insert({ course_id: courseId });
    expect(colleague.error).not.toBeNull();
    const topic = await clients.teacher.from("course_topic_outcomes").insert({ course_id: courseId, topic_id: topicId, outcome_id: co1 });
    expect(topic.error).toBeNull();
    for (const key of ["colleague", "student"]) {
      const s = await clients[key].from("course_attainment_settings").select("course_id");
      expect(s.data, key).toEqual([]);
      const t = await clients[key].from("course_topic_outcomes").select("topic_id");
      expect(t.data, key).toEqual([]);
    }
  });

  it("assessments: the teacher manages them, only with their own course's assignments", async () => {
    const foreign = await clients.teacher
      .from("course_assessments")
      .insert({ course_id: courseId, kind: "assignment", assignment_id: otherAssignmentId, title: "Other set" });
    expect(foreign.error).not.toBeNull();
    const own = await clients.teacher
      .from("course_assessments")
      .insert({ course_id: courseId, kind: "assignment", assignment_id: assignmentId, title: "Problem set 1", outcome_ids: [co1] });
    expect(own.error).toBeNull();
    const test = await clients.teacher.from("course_assessments").insert({ course_id: courseId, kind: "test", title: "Mid-sem 1" }).select("id").single();
    expect(test.error).toBeNull();
    testId = test.data!.id;
    const q = await clients.teacher.from("assessment_questions").insert({ assessment_id: testId, course_id: courseId, position: 0, label: "Q1", max_marks: 10, outcome_ids: [co1] });
    expect(q.error).toBeNull();
    const colleague = await clients.colleague.from("course_assessments").insert({ course_id: courseId, kind: "test", title: "Mine now" });
    expect(colleague.error).not.toBeNull();
    // A question can't be attached to another course's test.
    const crossQ = await clients.colleague.from("assessment_questions").insert({ assessment_id: testId, course_id: otherCourseId, position: 1, label: "Q2", max_marks: 5 });
    expect(crossQ.error).not.toBeNull();

    // Enrolled students see the tests (not the assignment rows) and their questions; others see nothing.
    const student = await clients.student.from("course_assessments").select("kind");
    expect(student.data).toEqual([{ kind: "test" }]);
    const questions = await clients.student.from("assessment_questions").select("label");
    expect(questions.data).toEqual([{ label: "Q1" }]);
    for (const key of ["colleague", "outsider"]) {
      const { data } = await clients[key].from("course_assessments").select("id");
      expect(data, key).toEqual([]);
    }
  });

  it("marks: a student reads only their own row; teachers of other courses read none", async () => {
    const { error } = await clients.teacher.from("assessment_marks").insert([
      { assessment_id: testId, course_id: courseId, row_key: "ME1", roll_number: "ME1", student_id: ids.student, marks: { q: 7 } },
      { assessment_id: testId, course_id: courseId, row_key: "ME2", roll_number: "ME2", student_id: ids.classmate, marks: { q: 4 } },
      { assessment_id: testId, course_id: courseId, row_key: "ME3", roll_number: "ME3", marks: {} },
    ]);
    expect(error).toBeNull();
    const student = await clients.student.from("assessment_marks").select("row_key, marks");
    expect(student.data).toEqual([{ row_key: "ME1", marks: { q: 7 } }]);
    const write = await clients.student.from("assessment_marks").update({ marks: { q: 10 } }).eq("row_key", "ME1").select("id");
    expect(write.data ?? []).toEqual([]);
    const teacher = await clients.teacher.from("assessment_marks").select("row_key").order("row_key");
    expect(teacher.data?.map((r) => r.row_key)).toEqual(["ME1", "ME2", "ME3"]);
    for (const key of ["colleague", "outsider", "instAdmin"]) {
      const { data } = await clients[key].from("assessment_marks").select("id");
      expect(data, key).toEqual([]);
    }
    const arrayMarks = await clients.teacher.from("assessment_marks").insert({ assessment_id: testId, course_id: courseId, row_key: "ME4", marks: [1] });
    expect(arrayMarks.error).not.toBeNull();
  });

  it("removing a CO removes its mappings and topic links", async () => {
    await clients.teacher.from("course_outcomes").delete().eq("id", co1);
    const maps = await admin.from("co_po_mappings").select("outcome_id").eq("course_id", courseId);
    expect(maps.data).toEqual([]);
    const topics = await admin.from("course_topic_outcomes").select("topic_id").eq("course_id", courseId);
    expect(topics.data).toEqual([]);
  });
});
