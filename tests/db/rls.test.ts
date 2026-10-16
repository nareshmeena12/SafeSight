/**
 * Row-level security. Runs against local Supabase; skipped when it is not
 * running (start it with `pnpm db:start`).
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
if (!env) console.warn("Skipping RLS tests: local Supabase is not running (pnpm db:start).");

const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);

describe.skipIf(!env)("row-level security", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let courseId: string;
  let otherCourseId: string;
  let assignmentId: string;
  let convA: string;
  let convB: string;
  let msgB: string;

  async function makeUser(key: string, role: "student" | "teacher") {
    const email = `rls-${key}-${run}@test.safesight.in`;
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

    const client = createClient(env!.url, env!.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
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
    admin = createClient(env!.url, env!.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await makeUser("studentA", "student");
    await makeUser("studentB", "student");
    await makeUser("teacher", "teacher");
    await makeUser("otherTeacher", "teacher");

    courseId = (await insert("courses", { teacher_id: ids.teacher, name: "RLS course" })).id;
    otherCourseId = (await insert("courses", { teacher_id: ids.otherTeacher, name: "Other course" })).id;
    await admin.from("enrollments").insert([
      { course_id: courseId, student_id: ids.studentA },
      { course_id: courseId, student_id: ids.studentB },
    ]);
    assignmentId = (await insert("assignments", { course_id: courseId, title: "Problem set" })).id;

    convA = (await insert("conversations", { student_id: ids.studentA, assignment_id: assignmentId })).id;
    convB = (await insert("conversations", { student_id: ids.studentB, assignment_id: assignmentId })).id;
    await insert("messages", { conversation_id: convA, role: "user", content: "A asks about the first law" });
    msgB = (await insert("messages", { conversation_id: convB, role: "user", content: "B asks for the answer" })).id;
    await insert("messages", { conversation_id: convB, role: "assistant", content: "What have you tried?" });
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    // Courses cascade to everything else; users cascade to their profiles.
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  it("a student cannot read another student's messages", async () => {
    const { data, error } = await clients.studentA.from("messages").select("conversation_id, content");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((m) => m.conversation_id === convA)).toBe(true);

    const direct = await clients.studentA.from("messages").select("id").eq("conversation_id", convB);
    expect(direct.data).toEqual([]);

    const convs = await clients.studentA.from("conversations").select("id").eq("id", convB);
    expect(convs.data).toEqual([]);
  });

  it("a student cannot write into another student's conversation", async () => {
    const { error } = await clients.studentA
      .from("messages")
      .insert({ conversation_id: convB, role: "user", content: "hello" });
    expect(error).not.toBeNull();
  });

  it("a student cannot write assistant replies or labels", async () => {
    const reply = await clients.studentA
      .from("messages")
      .insert({ conversation_id: convA, role: "assistant", content: "Here is the answer" });
    expect(reply.error).not.toBeNull();
    const labelled = await clients.studentA
      .from("messages")
      .insert({ conversation_id: convA, role: "user", content: "hi", intent: "concept_question" });
    expect(labelled.error).not.toBeNull();
  });

  it("a student cannot change their own role", async () => {
    await clients.studentA.from("profiles").update({ role: "teacher" }).eq("id", ids.studentA);
    const { data } = await admin.from("profiles").select("role").eq("id", ids.studentA).single();
    expect(data!.role).toBe("student");
  });

  it("a teacher sees chat text only for flagged or shared conversations", async () => {
    const before = await clients.teacher.from("messages").select("id");
    expect(before.data).toEqual([]);

    // Conversation metadata is visible for their course.
    const convs = await clients.teacher.from("conversations").select("id");
    expect(convs.data!.map((c) => c.id).sort()).toEqual([convA, convB].sort());

    await insert("flags", {
      student_id: ids.studentB,
      course_id: courseId,
      type: "answer_seeking",
      message_id: msgB,
    });
    const after = await clients.teacher.from("messages").select("conversation_id");
    expect(after.data!.length).toBe(2);
    expect(after.data!.every((m) => m.conversation_id === convB)).toBe(true);
  });

  it("a teacher cannot see another teacher's course, students or flags", async () => {
    const courses = await clients.otherTeacher.from("courses").select("id");
    expect(courses.data!.map((c) => c.id)).toEqual([otherCourseId]);
    const profiles = await clients.otherTeacher.from("profiles").select("id").eq("id", ids.studentA);
    expect(profiles.data).toEqual([]);
    const flags = await clients.otherTeacher.from("flags").select("id");
    expect(flags.data).toEqual([]);
    const messages = await clients.otherTeacher.from("messages").select("id");
    expect(messages.data).toEqual([]);
  });

  it("students cannot read pilot requests", async () => {
    await insert("pilot_requests", {
      name: "Test",
      institution: "Test college",
      role: "teacher",
      email: `pilot-${run}@test.safesight.in`,
    });
    const { data } = await clients.studentA.from("pilot_requests").select("id");
    expect(data ?? []).toEqual([]);
    await admin.from("pilot_requests").delete().eq("email", `pilot-${run}@test.safesight.in`);
  });

  it("teacher notes are teacher-only", async () => {
    await insert("assignment_teacher_notes", { assignment_id: assignmentId, notes: "Answer key: 42 kJ" });
    const student = await clients.studentA.from("assignment_teacher_notes").select("notes");
    expect(student.data).toEqual([]);
    const assignment = await clients.studentA.from("assignments").select("*").eq("id", assignmentId).single();
    expect(assignment.data).not.toHaveProperty("teacher_notes");
    const other = await clients.otherTeacher.from("assignment_teacher_notes").select("notes");
    expect(other.data).toEqual([]);
    const teacher = await clients.teacher.from("assignment_teacher_notes").select("notes");
    expect(teacher.data).toEqual([{ notes: "Answer key: 42 kJ" }]);
    const write = await clients.studentA
      .from("assignment_teacher_notes")
      .upsert({ assignment_id: assignmentId, notes: "changed" });
    expect(write.error).not.toBeNull();
  });

  it("the private answer key is teacher-only", async () => {
    await admin
      .from("assignment_teacher_notes")
      .upsert({ assignment_id: assignmentId, notes: "", answer_key: "W = 68.9 kJ" }, { onConflict: "assignment_id" });
    const student = await clients.studentA.from("assignment_teacher_notes").select("answer_key");
    expect(student.data).toEqual([]);
    const other = await clients.otherTeacher.from("assignment_teacher_notes").select("answer_key");
    expect(other.data).toEqual([]);
    const teacher = await clients.teacher.from("assignment_teacher_notes").select("answer_key").eq("assignment_id", assignmentId);
    expect(teacher.data).toEqual([{ answer_key: "W = 68.9 kJ" }]);
    // Students may see the non-secret limits on the assignment itself.
    const limits = await clients.studentA.from("assignments").select("max_hint_level, worked_examples").eq("id", assignmentId).single();
    expect(limits.data).toEqual({ max_hint_level: 4, worked_examples: true });
  });

  it("hint-ladder state: students read their own, nobody but the server writes", async () => {
    await insert("sage_ladder_state", { student_id: ids.studentB, assignment_id: assignmentId, step: 3, attempts: 2 });
    const own = await clients.studentB.from("sage_ladder_state").select("step");
    expect(own.data).toEqual([{ step: 3 }]);
    const other = await clients.studentA.from("sage_ladder_state").select("step");
    expect(other.data).toEqual([]);
    const teacher = await clients.teacher.from("sage_ladder_state").select("step");
    expect(teacher.data).toEqual([{ step: 3 }]);
    const outsider = await clients.otherTeacher.from("sage_ladder_state").select("step");
    expect(outsider.data).toEqual([]);

    const write = await clients.studentA
      .from("sage_ladder_state")
      .insert({ student_id: ids.studentA, assignment_id: assignmentId, step: 4 });
    expect(write.error).not.toBeNull();
    await clients.studentB.from("sage_ladder_state").update({ step: 4 }).eq("student_id", ids.studentB);
    const after = await admin.from("sage_ladder_state").select("step").eq("student_id", ids.studentB).single();
    expect(after.data!.step).toBe(3);
  });

  it("Explore chats: a student starts one only in an enrolled course; the teacher sees it like any chat", async () => {
    const own = await clients.studentA
      .from("conversations")
      .insert({ student_id: ids.studentA, course_id: courseId })
      .select("id, course_id, assignment_id")
      .single();
    expect(own.error).toBeNull();
    expect(own.data).toMatchObject({ course_id: courseId, assignment_id: null });
    const elsewhere = await clients.studentA.from("conversations").insert({ student_id: ids.studentA, course_id: otherCourseId });
    expect(elsewhere.error).not.toBeNull();
    // An assignment chat always takes the assignment's course.
    const mismatched = await insert<{ course_id: string }>("conversations", {
      student_id: ids.studentA,
      assignment_id: assignmentId,
      course_id: otherCourseId,
    });
    expect(mismatched.course_id).toBe(courseId);
    const teacher = await clients.teacher.from("conversations").select("id").eq("id", own.data!.id);
    expect(teacher.data).toHaveLength(1);
    const outsider = await clients.otherTeacher.from("conversations").select("id").eq("id", own.data!.id);
    expect(outsider.data).toEqual([]);
  });

  it("a student cannot write message labels or citations", async () => {
    for (const extra of [
      { topic: "x" },
      { attempted: true },
      { citations: [{ page: 1 }] },
      { attempt_quality: 0.9 },
      { guard: "pass" },
      { matched_assignment_id: assignmentId },
    ]) {
      const { error } = await clients.studentA
        .from("messages")
        .insert({ conversation_id: convA, role: "user", content: "hi", ...extra });
      expect(error).not.toBeNull();
    }
  });

  it("course PDFs: the teacher uploads, enrolled students read, others can't", async () => {
    const bucket = "course-materials";
    const path = `${courseId}/notes-${run}.pdf`;
    const pdf = () => new Blob(["%PDF-1.4 test"], { type: "application/pdf" });

    const up = await clients.teacher.storage.from(bucket).upload(path, pdf());
    expect(up.error).toBeNull();
    const foreign = await clients.otherTeacher.storage.from(bucket).upload(`${courseId}/x-${run}.pdf`, pdf());
    expect(foreign.error).not.toBeNull();
    const byStudent = await clients.studentA.storage.from(bucket).upload(`${courseId}/s-${run}.pdf`, pdf());
    expect(byStudent.error).not.toBeNull();

    const read = await clients.studentA.storage.from(bucket).download(path);
    expect(read.error).toBeNull();
    const outsider = await clients.otherTeacher.storage.from(bucket).download(path);
    expect(outsider.error).not.toBeNull();

    await admin.storage.from(bucket).remove([path]);
  });

  it("notes search only returns the caller's course materials", async () => {
    const material = await insert("materials", {
      course_id: courseId,
      title: "Lecture 4",
      file_path: `${courseId}/lecture-4.pdf`,
      status: "ready",
    });
    await insert("material_chunks", {
      material_id: material.id,
      page: 12,
      content: "The first law for a closed system: Q minus W equals the change in internal energy.",
    });
    const args = { p_course_id: courseId, p_query: "first law closed system" };
    const student = await clients.studentA.rpc("match_material_chunks", args);
    expect(student.error).toBeNull();
    expect(student.data!.map((r: { page: number | null }) => r.page)).toEqual([12]);
    const outsider = await clients.otherTeacher.rpc("match_material_chunks", args);
    expect(outsider.data).toEqual([]);
  });

  it("a student joins a course with its join code", async () => {
    const { data: course } = await admin.from("courses").select("join_code").eq("id", otherCourseId).single();
    const { data, error } = await clients.studentA.rpc("join_course", { p_join_code: course!.join_code.toLowerCase() });
    expect(error).toBeNull();
    expect(data).toBe(otherCourseId);
    const visible = await clients.studentA.from("courses").select("id").eq("id", otherCourseId);
    expect(visible.data).toHaveLength(1);
  });
});
