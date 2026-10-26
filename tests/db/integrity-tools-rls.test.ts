/**
 * Row-level security for S18's tables: assignment_number_sets,
 * numeric_answers and viva_questions. Runs against local Supabase; skipped
 * when it is not running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
if (!env) console.warn("Skipping integrity tools RLS tests: local Supabase is not running (pnpm db:start).");

const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);

const numberSet = (assignmentId: string) => ({
  assignment_id: assignmentId,
  variables: [{ name: "m", label: "Mass", unit: "kg", min: 0.2, max: 0.8, decimals: 2 }],
  formula: "m * 9.81",
  answer_unit: "N",
});

describe.skipIf(!env)("integrity tools RLS", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let courseId: string;
  let otherCourseId: string;
  let assignmentId: string;
  let otherAssignmentId: string;
  let submissionA: string;
  let submissionB: string;

  async function makeUser(key: string, role: "student" | "teacher") {
    const email = `integrity-${key}-${run}@test.safesight.in`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${key}` },
    });
    if (error) throw error;
    ids[key] = data.user.id;
    const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", data.user.id);
    if (roleError) throw roleError;
    const client = createClient(env!.url, env!.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
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
    await makeUser("studentA", "student");
    await makeUser("studentB", "student");
    await makeUser("teacher", "teacher");
    await makeUser("otherTeacher", "teacher");

    courseId = (await insert("courses", { teacher_id: ids.teacher, name: "Integrity course" })).id;
    otherCourseId = (await insert("courses", { teacher_id: ids.otherTeacher, name: "Other integrity course" })).id;
    await admin.from("enrollments").insert([
      { course_id: courseId, student_id: ids.studentA },
      { course_id: courseId, student_id: ids.studentB },
    ]);
    assignmentId = (await insert("assignments", { course_id: courseId, title: "Problem set" })).id;
    otherAssignmentId = (await insert("assignments", { course_id: otherCourseId, title: "Other problem set" })).id;

    await insert("assignment_number_sets", numberSet(assignmentId));
    await insert("assignment_number_sets", numberSet(otherAssignmentId));
    const { error } = await admin.from("numeric_answers").insert([
      { assignment_id: assignmentId, student_id: ids.studentA, answer_text: "4.2", answer_value: 4.2 },
      { assignment_id: assignmentId, student_id: ids.studentB, answer_text: "5.1", answer_value: 5.1 },
    ]);
    if (error) throw error;

    const now = new Date().toISOString();
    submissionA = (await insert("submissions", { assignment_id: assignmentId, student_id: ids.studentA, submitted_at: now })).id;
    submissionB = (await insert("submissions", { assignment_id: assignmentId, student_id: ids.studentB, submitted_at: now })).id;
    const questions = [{ question: "Why this step?", lookFor: "The idea.", discussedAt: null }];
    await insert("viva_questions", { submission_id: submissionA, questions, created_by: ids.teacher });
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  it("number sets: the course teacher reads their own, not another course's", async () => {
    const own = await clients.teacher.from("assignment_number_sets").select("assignment_id");
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ assignment_id: assignmentId }]);
  });

  it("number sets: students can't read the formula, even for their own assignment", async () => {
    const { data } = await clients.studentA.from("assignment_number_sets").select("formula");
    expect(data).toEqual([]);
    const write = await clients.studentA.from("assignment_number_sets").update({ formula: "1" }).eq("assignment_id", assignmentId).select();
    expect(write.data ?? []).toEqual([]);
  });

  it("number sets: a teacher can't write another teacher's", async () => {
    const insert = await clients.teacher.from("assignment_number_sets").upsert(numberSet(otherAssignmentId));
    expect(insert.error).not.toBeNull();
    await clients.teacher.from("assignment_number_sets").delete().eq("assignment_id", otherAssignmentId);
    const { count } = await admin
      .from("assignment_number_sets")
      .select("assignment_id", { count: "exact", head: true })
      .eq("assignment_id", otherAssignmentId);
    expect(count).toBe(1);
  });

  it("number sets: the course teacher can edit their own", async () => {
    const { data, error } = await clients.teacher
      .from("assignment_number_sets")
      .update({ tolerance_pct: 2 })
      .eq("assignment_id", assignmentId)
      .select("tolerance_pct");
    expect(error).toBeNull();
    expect(data).toEqual([{ tolerance_pct: 2 }]);
  });

  it("answers: a student reads only their own", async () => {
    const { data, error } = await clients.studentA.from("numeric_answers").select("student_id, answer_text");
    expect(error).toBeNull();
    expect(data).toEqual([{ student_id: ids.studentA, answer_text: "4.2" }]);
  });

  it("answers: the course teacher reads the class; another teacher reads nothing", async () => {
    const own = await clients.teacher.from("numeric_answers").select("student_id");
    expect(own.data!.length).toBe(2);
    const other = await clients.otherTeacher.from("numeric_answers").select("student_id");
    expect(other.data).toEqual([]);
  });

  it("answers: nobody but the service role writes", async () => {
    const insert = await clients.studentA
      .from("numeric_answers")
      .upsert({ assignment_id: assignmentId, student_id: ids.studentA, answer_text: "9.9" });
    expect(insert.error).not.toBeNull();
    const update = await clients.teacher.from("numeric_answers").update({ answer_text: "1" }).eq("assignment_id", assignmentId).select();
    expect(update.data ?? []).toEqual([]);
  });

  it("viva questions: only the course teacher reads them", async () => {
    const own = await clients.teacher.from("viva_questions").select("submission_id");
    expect(own.data).toEqual([{ submission_id: submissionA }]);
    expect((await clients.otherTeacher.from("viva_questions").select("submission_id")).data).toEqual([]);
    // Teacher preparation, like teacher notes: not shown to the student.
    expect((await clients.studentA.from("viva_questions").select("submission_id")).data).toEqual([]);
  });

  it("viva questions: nobody but the service role writes", async () => {
    const insert = await clients.teacher.from("viva_questions").insert({ submission_id: submissionB, questions: [] });
    expect(insert.error).not.toBeNull();
    const update = await clients.teacher.from("viva_questions").update({ questions: [] }).eq("submission_id", submissionA).select();
    expect(update.data ?? []).toEqual([]);
  });
});
