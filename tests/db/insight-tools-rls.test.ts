/**
 * Row-level security for S19's tables: lecture_briefs, brief_quiz_sessions,
 * brief_quiz_responses, feedback_drafts, teacher_digests and
 * teacher_digest_prefs. Runs against local Supabase; skipped when it is not
 * running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
if (!env) console.warn("Skipping insight tools RLS tests: local Supabase is not running (pnpm db:start).");

const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);
const quiz = [{ question: "Q?", options: ["a", "b", "c", "d"], answer: 1, explanation: "Because.", misconception: 0 }];

describe.skipIf(!env)("insight tools RLS", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let courseId: string;
  let otherCourseId: string;
  let briefId: string;
  let otherBriefId: string;
  let sessionId: string;
  let submissionA: string;
  let submissionB: string;

  async function makeUser(key: string, role: "student" | "teacher") {
    const email = `insight-${key}-${run}@test.safesight.in`;
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

  const brief = (course: string) => ({
    course_id: course,
    week: "2026-10-26",
    period_start: "2026-10-19T00:00:00Z",
    period_end: "2026-10-26T00:00:00Z",
    source: "teacher",
    misconceptions: [{ title: "T", summary: "S", students: 2, quotes: ["a quote"], explanation: "E" }],
    quiz,
  });

  beforeAll(async () => {
    admin = createClient(env!.url, env!.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await makeUser("studentA", "student");
    await makeUser("studentB", "student");
    await makeUser("outsider", "student");
    await makeUser("teacher", "teacher");
    await makeUser("otherTeacher", "teacher");

    courseId = (await insert("courses", { teacher_id: ids.teacher, name: "Insight course" })).id;
    otherCourseId = (await insert("courses", { teacher_id: ids.otherTeacher, name: "Other insight course" })).id;
    const { error } = await admin.from("enrollments").insert([
      { course_id: courseId, student_id: ids.studentA },
      { course_id: courseId, student_id: ids.studentB },
      { course_id: otherCourseId, student_id: ids.outsider },
    ]);
    if (error) throw error;

    briefId = (await insert("lecture_briefs", brief(courseId))).id;
    otherBriefId = (await insert("lecture_briefs", brief(otherCourseId))).id;
    sessionId = (await insert("brief_quiz_sessions", { brief_id: briefId, course_id: courseId, code: "123456", questions: quiz })).id;
    await insert("brief_quiz_sessions", { brief_id: otherBriefId, course_id: otherCourseId, code: "654321", questions: quiz });
    const responses = await admin.from("brief_quiz_responses").insert([
      { session_id: sessionId, question_index: 0, student_id: ids.studentA, choice: 1 },
      { session_id: sessionId, question_index: 0, student_id: ids.studentB, choice: 2 },
    ]);
    if (responses.error) throw responses.error;

    const assignmentId = (await insert("assignments", { course_id: courseId, title: "Essay", rubric: "Argument (10)" })).id;
    const now = new Date().toISOString();
    submissionA = (await insert("submissions", { assignment_id: assignmentId, student_id: ids.studentA, submitted_at: now })).id;
    submissionB = (await insert("submissions", { assignment_id: assignmentId, student_id: ids.studentB, submitted_at: now })).id;
    const criteria = [{ criterion: "Argument", description: "", maxPoints: 10, points: 7, comment: "Good." }];
    await insert("feedback_drafts", { submission_id: submissionA, criteria, overall: "Approved one.", status: "approved", approved_at: now });
    await insert("feedback_drafts", { submission_id: submissionB, criteria, overall: "Still a draft.", status: "draft" });

    await insert("teacher_digests", { teacher_id: ids.teacher, week: "2026-10-26", content: {}, email_status: "not_configured" });
    await insert("teacher_digests", { teacher_id: ids.otherTeacher, week: "2026-10-26", content: {}, email_status: "sent" });
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  it("briefs: the course teacher reads their own, not another course's; students read none", async () => {
    const own = await clients.teacher.from("lecture_briefs").select("id");
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ id: briefId }]);
    expect((await clients.studentA.from("lecture_briefs").select("id")).data).toEqual([]);
  });

  it("briefs: nobody but the service role writes", async () => {
    const write = await clients.teacher.from("lecture_briefs").insert(brief(courseId));
    expect(write.error).not.toBeNull();
    const update = await clients.teacher.from("lecture_briefs").update({ quiz: [] }).eq("id", briefId).select();
    expect(update.data ?? []).toEqual([]);
  });

  it("quiz sessions: teacher reads their course's; students can't read questions (they carry answers)", async () => {
    expect((await clients.teacher.from("brief_quiz_sessions").select("id")).data).toEqual([{ id: sessionId }]);
    expect((await clients.studentA.from("brief_quiz_sessions").select("id")).data).toEqual([]);
    const close = await clients.otherTeacher.from("brief_quiz_sessions").update({ closed_at: new Date().toISOString() }).eq("id", sessionId).select();
    expect(close.data ?? []).toEqual([]);
  });

  it("quiz responses: a student reads only their own; teachers read none directly", async () => {
    const own = await clients.studentA.from("brief_quiz_responses").select("student_id, choice");
    expect(own.data).toEqual([{ student_id: ids.studentA, choice: 1 }]);
    expect((await clients.teacher.from("brief_quiz_responses").select("student_id")).data).toEqual([]);
    const write = await clients.studentA.from("brief_quiz_responses").insert({ session_id: sessionId, question_index: 1, student_id: ids.studentA, choice: 0 });
    expect(write.error).not.toBeNull();
  });

  it("feedback: the student reads their own only once approved; never another student's", async () => {
    expect((await clients.studentA.from("feedback_drafts").select("submission_id")).data).toEqual([{ submission_id: submissionA }]);
    // B's feedback is still a draft: invisible to B.
    expect((await clients.studentB.from("feedback_drafts").select("submission_id")).data).toEqual([]);
    expect((await clients.outsider.from("feedback_drafts").select("submission_id")).data).toEqual([]);
  });

  it("feedback: the course teacher reads drafts and approved; another teacher reads none; nobody writes", async () => {
    expect((await clients.teacher.from("feedback_drafts").select("submission_id")).data!.length).toBe(2);
    expect((await clients.otherTeacher.from("feedback_drafts").select("submission_id")).data).toEqual([]);
    const update = await clients.teacher.from("feedback_drafts").update({ status: "approved" }).eq("submission_id", submissionB).select();
    expect(update.data ?? []).toEqual([]);
    const self = await clients.studentB.from("feedback_drafts").update({ status: "approved" }).eq("submission_id", submissionB).select();
    expect(self.data ?? []).toEqual([]);
  });

  it("digests: a teacher reads only their own", async () => {
    const own = await clients.teacher.from("teacher_digests").select("teacher_id");
    expect(own.data).toEqual([{ teacher_id: ids.teacher }]);
    expect((await clients.studentA.from("teacher_digests").select("teacher_id")).data).toEqual([]);
  });

  it("digest prefs: a teacher manages their own row only; students can't create one", async () => {
    const own = await clients.teacher.from("teacher_digest_prefs").upsert({ teacher_id: ids.teacher, weekly_email: false }).select();
    expect(own.error).toBeNull();
    const other = await clients.teacher.from("teacher_digest_prefs").upsert({ teacher_id: ids.otherTeacher, weekly_email: false });
    expect(other.error).not.toBeNull();
    expect((await clients.otherTeacher.from("teacher_digest_prefs").select("teacher_id")).data).toEqual([]);
    const student = await clients.studentA.from("teacher_digest_prefs").insert({ teacher_id: ids.studentA, weekly_email: true });
    expect(student.error).not.toBeNull();
  });
});
