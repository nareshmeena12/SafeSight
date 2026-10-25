/**
 * Row-level security for ai_usage and sage_preview_chats (S16, ROADMAP.md).
 * Runs against local Supabase; skipped when it is not running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
if (!env) console.warn("Skipping ai_usage/preview RLS tests: local Supabase is not running (pnpm db:start).");

const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);

describe.skipIf(!env)("ai_usage and preview chats RLS", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let institutionId: string;
  let courseId: string;
  let otherCourseId: string;
  let assignmentId: string;

  async function makeUser(key: string, role: "student" | "teacher") {
    const email = `usage-${key}-${run}@test.safesight.in`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${key}` },
    });
    if (error) throw error;
    ids[key] = data.user.id;
    const { error: roleError } = await admin
      .from("profiles")
      .update({ role, institution_id: institutionId })
      .eq("id", data.user.id);
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
    institutionId = (await insert("institutions", { name: `Usage test ${run}` })).id;
    await makeUser("studentA", "student");
    await makeUser("studentB", "student");
    await makeUser("teacher", "teacher");
    await makeUser("otherTeacher", "teacher");

    courseId = (await insert("courses", { teacher_id: ids.teacher, name: "Usage course" })).id;
    otherCourseId = (await insert("courses", { teacher_id: ids.otherTeacher, name: "Other usage course" })).id;
    await admin.from("enrollments").insert({ course_id: courseId, student_id: ids.studentA });
    assignmentId = (await insert("assignments", { course_id: courseId, title: "Problem set" })).id;

    const { error } = await admin.from("ai_usage").insert([
      { user_id: ids.studentA, feature: "sage_reply", model: "m", input_tokens: 100, output_tokens: 20 },
      { user_id: ids.studentB, feature: "sage_reply", model: "m", input_tokens: 50, output_tokens: 10 },
      { user_id: ids.teacher, feature: "lens", model: "m", input_tokens: 10, output_tokens: 5 },
    ]);
    if (error) throw error;

    await insert("sage_preview_chats", { teacher_id: ids.teacher, course_id: courseId, assignment_id: assignmentId });
    await insert("sage_preview_chats", { teacher_id: ids.otherTeacher, course_id: otherCourseId });
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("ai_usage").delete().in("user_id", Object.values(ids));
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
    if (institutionId) await admin.from("institutions").delete().eq("id", institutionId);
  });

  it("fills the institution from the user's profile and totals the tokens", async () => {
    const { data } = await admin.from("ai_usage").select("institution_id, total_tokens").eq("user_id", ids.studentA).single();
    expect(data).toEqual({ institution_id: institutionId, total_tokens: 120 });
  });

  it("a user reads only their own usage rows", async () => {
    const { data, error } = await clients.studentA.from("ai_usage").select("user_id");
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data!.every((r) => r.user_id === ids.studentA)).toBe(true);
    // A teacher doesn't see their students' usage either.
    const teacher = await clients.teacher.from("ai_usage").select("user_id");
    expect(teacher.data!.every((r) => r.user_id === ids.teacher)).toBe(true);
  });

  it("nobody but the service role writes usage rows", async () => {
    const { error } = await clients.studentA.from("ai_usage").insert({ user_id: ids.studentA, feature: "sage_reply" });
    expect(error).not.toBeNull();
    await clients.studentA.from("ai_usage").delete().eq("user_id", ids.studentA);
    const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", ids.studentA);
    expect(count).toBe(1);
  });

  it("a teacher reads only their own preview chats", async () => {
    const own = await clients.teacher.from("sage_preview_chats").select("teacher_id, course_id");
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ teacher_id: ids.teacher, course_id: courseId }]);
    const other = await clients.otherTeacher.from("sage_preview_chats").select("course_id");
    expect(other.data).toEqual([{ course_id: otherCourseId }]);
  });

  it("students can't read preview chats, even in their own course", async () => {
    const { data } = await clients.studentA.from("sage_preview_chats").select("id");
    expect(data).toEqual([]);
  });

  it("a teacher can't write preview chats directly or delete another teacher's", async () => {
    const insert = await clients.teacher
      .from("sage_preview_chats")
      .insert({ teacher_id: ids.teacher, course_id: courseId });
    expect(insert.error).not.toBeNull();
    const update = await clients.teacher
      .from("sage_preview_chats")
      .update({ messages: [{ role: "assistant", content: "x" }] })
      .eq("course_id", courseId)
      .select("id");
    expect(update.data ?? []).toEqual([]);
    await clients.teacher.from("sage_preview_chats").delete().eq("course_id", otherCourseId);
    const { count } = await admin
      .from("sage_preview_chats")
      .select("id", { count: "exact", head: true })
      .eq("course_id", otherCourseId);
    expect(count).toBe(1);
  });

  it("a teacher can clear their own preview", async () => {
    await clients.teacher.from("sage_preview_chats").delete().eq("course_id", courseId);
    const { count } = await admin.from("sage_preview_chats").select("id", { count: "exact", head: true }).eq("course_id", courseId);
    expect(count).toBe(0);
  });
});
