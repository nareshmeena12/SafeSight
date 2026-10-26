/**
 * Row-level security for S20 exam prep: course_exam_info, course_note_topics,
 * exam_plans, mock_tests, mock_test_items, mock_test_item_keys, and the new
 * 'mock' mastery source. Runs against local Supabase; skipped when it is not
 * running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);

describe.skipIf(!env)("exam prep row-level security", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let courseId: string;
  let otherCourseId: string;
  let planId: string;
  let testId: string;
  let itemId: string;

  async function makeUser(key: string, role: "student" | "teacher") {
    const email = `exam-${key}-${run}@test.safesight.in`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${key}` },
    });
    if (error) throw error;
    ids[key] = data.user.id;
    await admin.from("profiles").update({ role }).eq("id", data.user.id);
    const client = createClient(env!.url, env!.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    clients[key] = client;
  }

  async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
    const { data, error } = await p;
    if (error || data === null || data === undefined) throw new Error(error?.message ?? "no data");
    return data;
  }

  async function ok(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    if (error) throw new Error(error.message);
  }

  beforeAll(async () => {
    admin = createClient(env!.url, env!.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await makeUser("studentA", "student");
    await makeUser("studentB", "student");
    await makeUser("outsider", "student");
    await makeUser("teacher", "teacher");
    await makeUser("otherTeacher", "teacher");

    courseId = (await must(admin.from("courses").insert({ teacher_id: ids.teacher, name: "Exam course" }).select().single())).id;
    otherCourseId = (await must(admin.from("courses").insert({ teacher_id: ids.otherTeacher, name: "Other exam course" }).select().single())).id;
    await ok(
      admin.from("enrollments").insert([
        { course_id: courseId, student_id: ids.studentA },
        { course_id: courseId, student_id: ids.studentB },
        { course_id: otherCourseId, student_id: ids.outsider },
      ]),
    );
    await ok(
      admin.from("course_note_topics").insert({ course_id: courseId, topics: [{ title: "Entropy", materialId: randomUUID(), page: 3 }], source_key: "x" }),
    );
    const plan = await must(
      admin
        .from("exam_plans")
        .insert({
          student_id: ids.studentA,
          course_id: courseId,
          exam_date: "2026-12-01",
          minutes_per_day: 60,
          topics: [],
          days: [],
        })
        .select("id")
        .single(),
    );
    planId = plan.id;
    const test = await must(
      admin
        .from("mock_tests")
        .insert({
          student_id: ids.studentA,
          course_id: courseId,
          plan_id: planId,
          title: "Mock test",
          minutes: 20,
          ends_at: new Date(Date.now() + 20 * 60_000).toISOString(),
        })
        .select("id")
        .single(),
    );
    testId = test.id;
    const item = await must(
      admin
        .from("mock_test_items")
        .insert({ test_id: testId, position: 1, kind: "numeric", format: "open", topic: "Entropy", question: "Find ΔS.", marks: 4 })
        .select("id")
        .single(),
    );
    itemId = item.id;
    await ok(admin.from("mock_test_item_keys").insert({ item_id: itemId, solution: "ΔS = Q/T = 3 J/K", final_answer: "3 J/K" }));
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  it("the course teacher publishes the syllabus; enrolled students read it, others don't", async () => {
    await ok(
      clients.teacher
        .from("course_exam_info")
        .upsert({ course_id: courseId, topics: [{ title: "Entropy", unit: "Unit 2" }], pattern: "3 hours", exam_date: "2026-12-01" }),
    );
    const { data: student } = await clients.studentA.from("course_exam_info").select("pattern");
    expect(student?.map((r) => r.pattern)).toEqual(["3 hours"]);
    for (const who of ["outsider", "otherTeacher"]) {
      const { data } = await clients[who].from("course_exam_info").select("*");
      expect(data?.length ?? 0, who).toBe(0);
    }
  });

  it("only the course teacher may write the syllabus", async () => {
    const other = await clients.otherTeacher.from("course_exam_info").insert({ course_id: courseId, pattern: "x" });
    expect(other.error).not.toBeNull();
    const student = await clients.studentA.from("course_exam_info").update({ pattern: "No exam" }).eq("course_id", courseId).select();
    expect(student.data?.length ?? 0).toBe(0);
    const intoOther = await clients.teacher.from("course_exam_info").insert({ course_id: otherCourseId, pattern: "x" });
    expect(intoOther.error).not.toBeNull();
  });

  it("a student reads their own plan, mock test and questions", async () => {
    const { data: plans } = await clients.studentA.from("exam_plans").select("id");
    expect(plans?.map((p) => p.id)).toEqual([planId]);
    const { data: tests } = await clients.studentA.from("mock_tests").select("id");
    expect(tests?.map((t) => t.id)).toEqual([testId]);
    const { data: items } = await clients.studentA.from("mock_test_items").select("id");
    expect(items?.map((i) => i.id)).toEqual([itemId]);
  });

  it("another student and the teacher read none of them", async () => {
    for (const who of ["studentB", "teacher", "otherTeacher"]) {
      for (const table of ["exam_plans", "mock_tests", "mock_test_items"] as const) {
        const { data } = await clients[who].from(table).select("*");
        expect(data?.length ?? 0, `${who} ${table}`).toBe(0);
      }
    }
  });

  it("nobody but the server reads mock answers or the notes topic cache", async () => {
    for (const who of ["studentA", "studentB", "teacher"]) {
      for (const table of ["mock_test_item_keys", "course_note_topics"] as const) {
        const { data } = await clients[who].from(table).select("*");
        expect(data?.length ?? 0, `${who} ${table}`).toBe(0);
      }
    }
  });

  it("students can't write plans, marks or answers directly", async () => {
    const plan = await clients.studentA
      .from("exam_plans")
      .insert({ student_id: ids.studentA, course_id: otherCourseId, exam_date: "2026-12-01", minutes_per_day: 30, topics: [], days: [] });
    expect(plan.error).not.toBeNull();
    const tick = await clients.studentA.from("exam_plans").update({ done: ["x"] }).eq("id", planId).select();
    expect(tick.data?.length ?? 0).toBe(0);
    const marks = await clients.studentA.from("mock_tests").update({ score: 1, graded_at: new Date().toISOString() }).eq("id", testId).select();
    expect(marks.data?.length ?? 0).toBe(0);
    const answer = await clients.studentA.from("mock_test_items").update({ score: 1, verdict: "correct" }).eq("id", itemId).select();
    expect(answer.data?.length ?? 0).toBe(0);
  });

  it("mock test results can feed mastery", async () => {
    await ok(
      admin
        .from("topic_mastery")
        .insert({ student_id: ids.studentA, course_id: courseId, topic_key: "entropy", topic: "Entropy", mastery: 0.5, evidence: 1, last_source: "mock" }),
    );
  });
});
