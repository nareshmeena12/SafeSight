/**
 * Row-level security for Trace (S9): submissions, writing events and replay
 * snapshots. Runs against local Supabase; skipped when it is not running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);

describe.skipIf(!env)("Trace row-level security", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let courseId: string;
  let otherCourseId: string;
  let assignmentId: string;
  let subA: string;

  async function makeUser(key: string, role: "student" | "teacher") {
    const email = `trace-${key}-${run}@test.safesight.in`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${key}` },
    });
    if (error) throw error;
    ids[key] = data.user.id;
    await admin.from("profiles").update({ role }).eq("id", data.user.id);
    const client = createClient(env!.url, env!.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    clients[key] = client;
  }

  beforeAll(async () => {
    admin = createClient(env!.url, env!.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await makeUser("studentA", "student");
    await makeUser("studentB", "student");
    await makeUser("teacher", "teacher");
    await makeUser("otherTeacher", "teacher");

    const course = await admin.from("courses").insert({ teacher_id: ids.teacher, name: "Trace course" }).select().single();
    courseId = course.data!.id;
    const other = await admin.from("courses").insert({ teacher_id: ids.otherTeacher, name: "Other course" }).select().single();
    otherCourseId = other.data!.id;
    await admin.from("enrollments").insert([
      { course_id: courseId, student_id: ids.studentA },
      { course_id: courseId, student_id: ids.studentB },
    ]);
    const assignment = await admin.from("assignments").insert({ course_id: courseId, title: "Essay" }).select().single();
    assignmentId = assignment.data!.id;
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  it("a student starts a draft and records events and snapshots", async () => {
    const sub = await clients.studentA
      .from("submissions")
      .insert({ assignment_id: assignmentId, student_id: ids.studentA })
      .select("id")
      .single();
    expect(sub.error).toBeNull();
    subA = sub.data!.id;

    const events = await clients.studentA.from("writing_events").insert([
      { submission_id: subA, type: "type", size: 12 },
      { submission_id: subA, type: "paste", size: 300 },
    ]);
    expect(events.error).toBeNull();
    const snap = await clients.studentA
      .from("writing_snapshots")
      .insert({ submission_id: subA, content: "<p>Hello</p>", char_count: 5 });
    expect(snap.error).toBeNull();
  });

  it("another student cannot read or write into that draft", async () => {
    const read = await clients.studentB.from("writing_snapshots").select("id").eq("submission_id", subA);
    expect(read.data).toEqual([]);
    const events = await clients.studentB.from("writing_events").select("id").eq("submission_id", subA);
    expect(events.data).toEqual([]);
    const write = await clients.studentB
      .from("writing_snapshots")
      .insert({ submission_id: subA, content: "<p>x</p>", char_count: 1 });
    expect(write.error).not.toBeNull();
  });

  it("the course teacher reads snapshots; another teacher does not", async () => {
    const own = await clients.teacher.from("writing_snapshots").select("id").eq("submission_id", subA);
    expect(own.data).toHaveLength(1);
    const other = await clients.otherTeacher.from("writing_snapshots").select("id").eq("submission_id", subA);
    expect(other.data).toEqual([]);
  });

  it("nothing more can be recorded after submitting, and reports stay server-written", async () => {
    const submitted = await clients.studentA
      .from("submissions")
      .update({ submitted_at: new Date().toISOString() })
      .eq("id", subA);
    expect(submitted.error).toBeNull();

    const snap = await clients.studentA
      .from("writing_snapshots")
      .insert({ submission_id: subA, content: "<p>later</p>", char_count: 5 });
    expect(snap.error).not.toBeNull();
    const edit = await clients.studentA.from("submissions").update({ content: "changed" }).eq("id", subA).select("id");
    expect(edit.data ?? []).toEqual([]);

    const report = await clients.studentA.from("integrity_reports").insert({
      submission_id: subA,
      paste_ratio: 0,
      active_minutes: 1,
      sessions: 1,
      summary: "Typed it all myself.",
    });
    expect(report.error).not.toBeNull();
  });
});
