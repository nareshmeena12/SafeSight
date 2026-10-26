/**
 * Row-level security for S22's tables: course_syllabi, course_units,
 * course_topics, course_outcomes, course_topic_materials and course_invites,
 * plus save_course_topic_map, claim_course_invites and profiles_by_email.
 * Runs against local Supabase; skipped when it is not running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
if (!env) console.warn("Skipping course setup RLS tests: local Supabase is not running (pnpm db:start).");

const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);
const emailFor = (key: string) => `setup-${key}-${run}@test.safesight.in`;

describe.skipIf(!env)("course setup RLS", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let courseId: string;
  let otherCourseId: string;
  let materialId: string;

  async function makeUser(key: string, role: "student" | "teacher") {
    const { data, error } = await admin.auth.admin.createUser({
      email: emailFor(key),
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${key}` },
    });
    if (error) throw error;
    ids[key] = data.user.id;
    const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", data.user.id);
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

  const units = [
    { title: "Basics", topics: [{ title: "Entropy" }, { title: "First law" }] },
    { title: "Cycles", topics: [{ title: "Otto cycle" }] },
  ];
  const outcomes = [{ code: "CO1", description: "Apply the first law" }];

  beforeAll(async () => {
    admin = createClient(env!.url, env!.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await makeUser("student", "student");
    await makeUser("outsider", "student");
    await makeUser("invited", "student");
    await makeUser("teacher", "teacher");
    await makeUser("otherTeacher", "teacher");

    courseId = (await insert("courses", { teacher_id: ids.teacher, name: "Setup course" })).id;
    otherCourseId = (await insert("courses", { teacher_id: ids.otherTeacher, name: "Other setup course" })).id;
    const { error } = await admin.from("enrollments").insert([
      { course_id: courseId, student_id: ids.student },
      { course_id: otherCourseId, student_id: ids.outsider },
    ]);
    if (error) throw error;
    materialId = (await insert("materials", { course_id: courseId, title: "Notes", file_path: `${courseId}/${randomUUID()}.pdf`, status: "ready" })).id;

    await insert("course_syllabi", { course_id: courseId, source: "text", source_text: "Unit I", extracted: { units: [] } });
    await insert("course_syllabi", { course_id: otherCourseId, source: "text", source_text: "Unit I" });
    await insert("course_invites", { course_id: courseId, email: emailFor("invited"), full_name: "Invited", roll_number: "ME23B099" });
    await insert("course_invites", { course_id: courseId, email: "nobody-yet@test.safesight.in" });
    await insert("course_invites", { course_id: otherCourseId, email: "other@test.safesight.in" });

    // The other teacher's course gets a map too, so cross-course reads have something to find.
    const other = await clients.otherTeacher.rpc("save_course_topic_map", {
      p_course_id: otherCourseId,
      p_units: [{ title: "Other", topics: [{ title: "Secret topic" }] }],
      p_outcomes: [],
    });
    if (other.error) throw other.error;
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  it("the course teacher saves a topic map; nobody else can", async () => {
    const own = await clients.teacher.rpc("save_course_topic_map", { p_course_id: courseId, p_units: units, p_outcomes: outcomes });
    expect(own.error).toBeNull();
    for (const key of ["otherTeacher", "student"]) {
      const write = await clients[key].rpc("save_course_topic_map", { p_course_id: courseId, p_units: [], p_outcomes: [] });
      expect(write.error).not.toBeNull();
    }
    const topics = await admin.from("course_topics").select("title").eq("course_id", courseId).order("title");
    expect(topics.data?.map((t) => t.title)).toEqual(["Entropy", "First law", "Otto cycle"]);
  });

  it("saving again keeps ids sent back, moves topics and removes the rest", async () => {
    const before = await admin.from("course_topics").select("id, title").eq("course_id", courseId);
    const entropy = before.data!.find((t) => t.title === "Entropy")!.id;
    const unitsBefore = await admin.from("course_units").select("id, title").eq("course_id", courseId);
    const cycles = unitsBefore.data!.find((u) => u.title === "Cycles")!.id;
    const { error } = await clients.teacher.rpc("save_course_topic_map", {
      p_course_id: courseId,
      p_units: [{ id: cycles, title: "Cycles and entropy", topics: [{ id: entropy, title: "Entropy change" }, { title: "Diesel cycle" }] }],
      p_outcomes: outcomes,
    });
    expect(error).toBeNull();
    const after = await admin.from("course_topics").select("id, title, unit_id").eq("course_id", courseId).order("position");
    expect(after.data).toEqual([
      { id: entropy, title: "Entropy change", unit_id: cycles },
      expect.objectContaining({ title: "Diesel cycle", unit_id: cycles }),
    ]);
    const unitsAfter = await admin.from("course_units").select("id").eq("course_id", courseId);
    expect(unitsAfter.data).toEqual([{ id: cycles }]);
    // Ids of another course's rows are ignored (a fresh row is made instead of moving theirs).
    const otherTopic = await admin.from("course_topics").select("id").eq("course_id", otherCourseId).single();
    await clients.teacher.rpc("save_course_topic_map", {
      p_course_id: courseId,
      p_units: [{ id: cycles, title: "Cycles and entropy", topics: [{ id: entropy, title: "Entropy change" }, { id: otherTopic.data!.id, title: "Stolen" }] }],
      p_outcomes: outcomes,
    });
    const still = await admin.from("course_topics").select("course_id, title").eq("id", otherTopic.data!.id).single();
    expect(still.data).toEqual({ course_id: otherCourseId, title: "Secret topic" });
  });

  it("topics, units and outcomes: the teacher and enrolled students read them; others don't", async () => {
    for (const table of ["course_units", "course_topics", "course_outcomes"]) {
      const teacher = await clients.teacher.from(table).select("course_id");
      expect(teacher.error).toBeNull();
      expect(new Set(teacher.data!.map((r) => r.course_id))).toEqual(new Set([courseId]));
      const student = await clients.student.from(table).select("course_id");
      expect(student.data!.length).toBeGreaterThan(0);
      expect(student.data!.every((r) => r.course_id === courseId)).toBe(true);
      expect((await clients.outsider.from(table).select("course_id").eq("course_id", courseId)).data).toEqual([]);
      expect((await clients.otherTeacher.from(table).select("course_id").eq("course_id", courseId)).data).toEqual([]);
    }
  });

  it("students can't write topics directly", async () => {
    const unit = await admin.from("course_units").select("id").eq("course_id", courseId).limit(1).single();
    const write = await clients.student.from("course_topics").insert({ course_id: courseId, unit_id: unit.data!.id, position: 9, title: "Mine" });
    expect(write.error).not.toBeNull();
  });

  it("topic notes: readable like topics, written only by the service role", async () => {
    const topic = await admin.from("course_topics").select("id").eq("course_id", courseId).limit(1).single();
    await insert("course_topic_materials", { topic_id: topic.data!.id, course_id: courseId, material_id: materialId, pages: [3] });
    expect((await clients.student.from("course_topic_materials").select("pages")).data).toEqual([{ pages: [3] }]);
    expect((await clients.outsider.from("course_topic_materials").select("pages")).data).toEqual([]);
    const write = await clients.teacher
      .from("course_topic_materials")
      .insert({ topic_id: topic.data!.id, course_id: courseId, material_id: materialId, pages: [4] });
    expect(write.error).not.toBeNull();
  });

  it("syllabi: the course teacher reads their own; students and other teachers don't; nobody writes", async () => {
    expect((await clients.teacher.from("course_syllabi").select("course_id")).data).toEqual([{ course_id: courseId }]);
    expect((await clients.student.from("course_syllabi").select("course_id")).data).toEqual([]);
    expect((await clients.otherTeacher.from("course_syllabi").select("course_id").eq("course_id", courseId)).data).toEqual([]);
    const update = await clients.teacher.from("course_syllabi").update({ source_text: "x" }).eq("course_id", courseId).select();
    expect(update.data ?? []).toEqual([]);
  });

  it("invites: the teacher reads and removes their own course's; can't add or see another course's", async () => {
    const own = await clients.teacher.from("course_invites").select("email").order("email");
    expect(own.data?.map((r) => r.email)).toEqual(["nobody-yet@test.safesight.in", emailFor("invited")].sort());
    const add = await clients.teacher.from("course_invites").insert({ course_id: courseId, email: "new@test.safesight.in" });
    expect(add.error).not.toBeNull();
    const removeOther = await clients.teacher.from("course_invites").delete().eq("course_id", otherCourseId).select();
    expect(removeOther.data ?? []).toEqual([]);
    const remove = await clients.teacher.from("course_invites").delete().eq("email", "nobody-yet@test.safesight.in").select("id");
    expect(remove.data).toHaveLength(1);
  });

  it("invites: a student reads only invites sent to their own email", async () => {
    expect((await clients.invited.from("course_invites").select("email")).data).toEqual([{ email: emailFor("invited") }]);
    expect((await clients.student.from("course_invites").select("email")).data).toEqual([]);
  });

  it("claim_course_invites enrols the invited student and fills their roll number; others claim nothing", async () => {
    expect((await clients.outsider.rpc("claim_course_invites")).data).toBe(0);
    expect((await clients.teacher.rpc("claim_course_invites")).data).toBe(0);
    const claim = await clients.invited.rpc("claim_course_invites");
    expect(claim.error).toBeNull();
    expect(claim.data).toBe(1);
    const enrolled = await admin.from("enrollments").select("course_id").eq("student_id", ids.invited);
    expect(enrolled.data).toEqual([{ course_id: courseId }]);
    const profile = await admin.from("profiles").select("roll_number").eq("id", ids.invited).single();
    expect(profile.data?.roll_number).toBe("ME23B099");
    const invite = await admin.from("course_invites").select("status, student_id").eq("email", emailFor("invited")).single();
    expect(invite.data).toEqual({ status: "joined", student_id: ids.invited });
    expect((await clients.invited.rpc("claim_course_invites")).data).toBe(0);
  });

  it("profiles_by_email is for the server only", async () => {
    const asTeacher = await clients.teacher.rpc("profiles_by_email", { p_emails: [emailFor("student")] });
    expect(asTeacher.error).not.toBeNull();
    const asServer = await admin.rpc("profiles_by_email", { p_emails: [emailFor("student").toUpperCase()] });
    expect(asServer.data).toEqual([expect.objectContaining({ id: ids.student, role: "student" })]);
  });
});
