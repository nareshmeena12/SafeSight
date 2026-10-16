/**
 * Teacher dashboard database functions (S7): aggregate RPCs stay inside the
 * teacher's own courses, and refresh_weekly_metrics() computes the Reliance
 * Score from PLAN.md §4. Runs against local Supabase; skipped when it is not
 * running (start it with `pnpm db:start`).
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
if (!env) console.warn("Skipping teacher dashboard tests: local Supabase is not running (pnpm db:start).");

const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe.skipIf(!env)("teacher dashboard functions", () => {
  let admin: SupabaseClient<Database>;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient<Database>> = {};
  let courseId: string;
  let convS1: string;

  async function makeUser(key: string, role: "student" | "teacher") {
    const email = `dash-${key}-${run}@test.safesight.in`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${key}` },
    });
    if (error) throw error;
    ids[key] = data.user.id;
    await admin.from("profiles").update({ role }).eq("id", data.user.id);
    const client = createClient<Database>(env!.url, env!.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    clients[key] = client;
  }

  beforeAll(async () => {
    admin = createClient<Database>(env!.url, env!.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await makeUser("s1", "student");
    await makeUser("s2", "student");
    await makeUser("teacher", "teacher");
    await makeUser("other", "teacher");

    const { data: course } = await admin
      .from("courses")
      .insert({ teacher_id: ids.teacher, name: "Dashboard course" })
      .select()
      .single();
    courseId = course!.id;
    await admin.from("enrollments").insert([
      { course_id: courseId, student_id: ids.s1 },
      { course_id: courseId, student_id: ids.s2 },
    ]);
    const { data: assignment } = await admin
      .from("assignments")
      .insert({ course_id: courseId, title: "Problem set" })
      .select()
      .single();

    const { data: c1 } = await admin
      .from("conversations")
      .insert({ student_id: ids.s1, assignment_id: assignment!.id })
      .select()
      .single();
    const { data: c2 } = await admin
      .from("conversations")
      .insert({ student_id: ids.s2, assignment_id: assignment!.id })
      .select()
      .single();
    convS1 = c1!.id;

    // s1: two answer-seeking messages, then the ladder reaches step 4 with no
    // attempt in between. a = 1, e = 1.
    // s2: a concept question (an attempt), then answer-seeking, then step 4.
    // a = 0.5, e = 0.
    const { error } = await admin.from("messages").insert([
      { conversation_id: c1!.id, role: "user", content: "x", intent: "answer_seeking", topic: "Carnot cycle", created_at: minutesAgo(10) },
      { conversation_id: c1!.id, role: "assistant", content: "x", hint_level: 1, created_at: minutesAgo(9) },
      { conversation_id: c1!.id, role: "user", content: "x", intent: "answer_seeking", topic: "Carnot cycle", created_at: minutesAgo(8) },
      { conversation_id: c1!.id, role: "assistant", content: "x", hint_level: 4, created_at: minutesAgo(7) },
      { conversation_id: c2!.id, role: "user", content: "x", intent: "concept_question", topic: "Entropy", created_at: minutesAgo(10) },
      { conversation_id: c2!.id, role: "user", content: "x", intent: "answer_seeking", topic: "carnot cycle ", created_at: minutesAgo(8) },
      { conversation_id: c2!.id, role: "assistant", content: "x", hint_level: 4, created_at: minutesAgo(7) },
    ]);
    if (error) throw error;

    // s1 submitted work that was 80% pasted. p = 0.8.
    const { data: submission } = await admin
      .from("submissions")
      .insert({ assignment_id: assignment!.id, student_id: ids.s1, content: "work", submitted_at: minutesAgo(5) })
      .select()
      .single();
    await admin.from("integrity_reports").insert({
      submission_id: submission!.id,
      paste_ratio: 0.8,
      active_minutes: 12,
      sessions: 1,
      summary: "Written in one session.",
    });
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    if (courseId) await admin.from("courses").delete().eq("id", courseId);
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  it("counts activity per student for the teacher's course only", async () => {
    const { data, error } = await clients.teacher.rpc("teacher_student_activity", { p_course_id: courseId });
    expect(error).toBeNull();
    const byStudent = Object.fromEntries(data!.map((r) => [r.student_id, r]));
    expect(byStudent[ids.s1]).toMatchObject({ conversations: 1, messages: 2, answer_seeking: 2 });
    expect(byStudent[ids.s2]).toMatchObject({ conversations: 1, messages: 2, answer_seeking: 1 });

    const other = await clients.other.rpc("teacher_student_activity", { p_course_id: courseId });
    expect(other.data).toEqual([]);
    const student = await clients.s1.rpc("teacher_student_activity", {});
    expect(student.data).toEqual([]);
  });

  it("ranks topics, merging case and spacing", async () => {
    const { data, error } = await clients.teacher.rpc("teacher_topic_struggles", { p_course_id: courseId });
    expect(error).toBeNull();
    expect(data![0]).toMatchObject({ messages: 3, students: 2, answer_seeking: 3 });
    expect(data![0].topic.toLowerCase()).toBe("carnot cycle");
    expect(data![1]).toMatchObject({ topic: "Entropy", messages: 1, students: 1 });

    const forS2 = await clients.teacher.rpc("teacher_topic_struggles", { p_course_id: courseId, p_student_id: ids.s2 });
    expect(forS2.data!.map((t) => t.messages).sort()).toEqual([1, 1]);

    const other = await clients.other.rpc("teacher_topic_struggles", { p_course_id: courseId });
    expect(other.data).toEqual([]);
  });

  it("computes the Reliance Score", async () => {
    const { data: rows, error } = await clients.teacher.rpc("refresh_weekly_metrics", { p_course_id: courseId });
    expect(error).toBeNull();
    expect(rows).toBe(2);

    const { data } = await clients.teacher.from("weekly_metrics").select("*").eq("course_id", courseId);
    const byStudent = Object.fromEntries(data!.map((r) => [r.student_id, r]));
    // 100 × (0.5·1 + 0.3·0.8 + 0.2·1) = 94
    expect(byStudent[ids.s1]).toMatchObject({ messages: 2, answer_seeking_share: 1, reliance_score: 94 });
    // No submitted work: 100 × (0.5·0.5 + 0.2·0) / 0.7 = 35.7
    expect(byStudent[ids.s2]).toMatchObject({ messages: 2, answer_seeking_share: 0.5 });
    expect(byStudent[ids.s2].reliance_score).toBeCloseTo(35.7, 1);
  });

  it("only lets the course's teacher or the service role refresh", async () => {
    const other = await clients.other.rpc("refresh_weekly_metrics", { p_course_id: courseId });
    expect(other.data).toBe(0);
    const student = await clients.s1.rpc("refresh_weekly_metrics", {});
    expect(student.data).toBe(0);
    const service = await admin.rpc("refresh_weekly_metrics", { p_course_id: courseId });
    expect(service.error).toBeNull();
    expect(service.data).toBe(2);
  });

  it("students cannot label their own messages with a topic", async () => {
    const { error } = await clients.s1
      .from("messages")
      .insert({ conversation_id: convS1, role: "user", content: "hi", topic: "Entropy" });
    expect(error).not.toBeNull();
    const plain = await clients.s1.from("messages").insert({ conversation_id: convS1, role: "user", content: "hi" });
    expect(plain.error).toBeNull();
  });
});
