/**
 * Row-level security for S21's tables: sage_photos (+ the private
 * sage-photos bucket), course_tas, doubts, course_announcements and
 * notifications, and the service-role-only find_user_by_email. Runs against
 * local Supabase; skipped when it is not running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
if (!env) console.warn("Skipping doubts/photos RLS tests: local Supabase is not running (pnpm db:start).");

const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);

describe.skipIf(!env)("photos and doubts RLS", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let courseId: string;
  let otherCourseId: string;
  let conversationA: string;
  let photoA: string;
  let photoB: string;
  let doubtA: string;
  let doubtB: string;
  let otherDoubt: string;
  let announcementId: string;
  let noticeA: string;
  const pathA = `${randomUUID()}.jpg`;

  async function makeUser(key: string, role: "student" | "teacher") {
    const email = `doubts-${key}-${run}@test.safesight.in`;
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

  const photo = (student: string, course: string, extra: object = {}) => ({
    student_id: student,
    course_id: course,
    mime_type: "image/jpeg",
    size_bytes: 10,
    lines: ["a = 1"],
    ...extra,
  });
  const doubt = (student: string, course: string, question: string, extra: object = {}) => ({
    course_id: course,
    student_id: student,
    student_name: "Test",
    question,
    ...extra,
  });

  beforeAll(async () => {
    admin = createClient(env!.url, env!.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await makeUser("studentA", "student");
    await makeUser("studentB", "student");
    await makeUser("outsider", "student");
    await makeUser("ta", "student");
    await makeUser("otherTa", "student");
    await makeUser("teacher", "teacher");
    await makeUser("otherTeacher", "teacher");

    courseId = (await insert("courses", { teacher_id: ids.teacher, name: "Doubts course" })).id;
    otherCourseId = (await insert("courses", { teacher_id: ids.otherTeacher, name: "Other doubts course" })).id;
    const { error } = await admin.from("enrollments").insert([
      { course_id: courseId, student_id: ids.studentA },
      { course_id: courseId, student_id: ids.studentB },
      { course_id: otherCourseId, student_id: ids.outsider },
    ]);
    if (error) throw error;
    await insert("course_tas", { course_id: courseId, user_id: ids.ta, full_name: "Test ta" });
    await insert("course_tas", { course_id: otherCourseId, user_id: ids.otherTa, full_name: "Test otherTa" });

    conversationA = (await insert("conversations", { student_id: ids.studentA, course_id: courseId })).id;
    const messageA = (await insert("messages", { conversation_id: conversationA, role: "user", content: "My working (from a photo I checked):\nLine 1: a = 1" })).id;
    const upload = await admin.storage.from("sage-photos").upload(`${ids.studentA}/${pathA}`, jpeg, { contentType: "image/jpeg" });
    if (upload.error) throw upload.error;
    photoA = (
      await insert(
        "sage_photos",
        photo(ids.studentA, courseId, {
          storage_path: `${ids.studentA}/${pathA}`,
          conversation_id: conversationA,
          message_id: messageA,
          status: "sent",
          sent_at: new Date().toISOString(),
        }),
      )
    ).id;
    photoB = (await insert("sage_photos", photo(ids.studentB, courseId))).id;

    announcementId = (await insert("course_announcements", { course_id: courseId, title: "Polytropic work", body: "Answer for all." })).id;
    await insert("course_announcements", { course_id: otherCourseId, title: "Other", body: "Other course." });
    doubtA = (await insert("doubts", doubt(ids.studentA, courseId, "Question from A", { conversation_id: conversationA }))).id;
    doubtB = (await insert("doubts", doubt(ids.studentB, courseId, "Question from B"))).id;
    otherDoubt = (await insert("doubts", doubt(ids.outsider, otherCourseId, "Question from another course"))).id;

    noticeA = (await insert("notifications", { user_id: ids.studentA, kind: "doubt_answered", title: "Answered", link: "/student/doubts" })).id;
    await insert("notifications", { user_id: ids.studentB, kind: "doubt_answered", title: "Answered B" });
  }, 90_000);

  afterAll(async () => {
    if (!admin) return;
    if (ids.studentA) await admin.storage.from("sage-photos").remove([`${ids.studentA}/${pathA}`]);
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  const idsOf = (rows: { id: string }[] | null) => (rows ?? []).map((r) => r.id).sort();

  it("photos: a student reads only their own", async () => {
    expect(idsOf((await clients.studentA.from("sage_photos").select("id")).data)).toEqual([photoA]);
    expect(idsOf((await clients.studentB.from("sage_photos").select("id")).data)).toEqual([photoB]);
    expect((await clients.outsider.from("sage_photos").select("id")).data).toEqual([]);
  });

  it("photos: the teacher sees one only once its chat is shared or flagged; TAs never", async () => {
    expect((await clients.teacher.from("sage_photos").select("id")).data).toEqual([]);
    expect((await clients.ta.from("sage_photos").select("id")).data).toEqual([]);
    await admin.from("conversations").update({ shared_with_teacher: true }).eq("id", conversationA);
    expect(idsOf((await clients.teacher.from("sage_photos").select("id")).data)).toEqual([photoA]);
    expect((await clients.otherTeacher.from("sage_photos").select("id")).data).toEqual([]);
    expect((await clients.ta.from("sage_photos").select("id")).data).toEqual([]);
    await admin.from("conversations").update({ shared_with_teacher: false }).eq("id", conversationA);
  });

  it("photos: nobody writes rows, and the bucket is closed to browsers (even the owner)", async () => {
    const write = await clients.studentA.from("sage_photos").insert(photo(ids.studentA, courseId));
    expect(write.error).not.toBeNull();
    const update = await clients.studentA.from("sage_photos").update({ status: "sent" }).eq("id", photoB).select();
    expect(update.data ?? []).toEqual([]);
    const download = await clients.studentA.storage.from("sage-photos").download(`${ids.studentA}/${pathA}`);
    expect(download.data).toBeNull();
    const upload = await clients.studentA.storage.from("sage-photos").upload(`${ids.studentA}/${randomUUID()}.jpg`, jpeg, { contentType: "image/jpeg" });
    expect(upload.error).not.toBeNull();
  });

  it("doubts: a student reads their own, never a classmate's", async () => {
    expect(idsOf((await clients.studentA.from("doubts").select("id")).data)).toEqual([doubtA]);
    expect((await clients.outsider.from("doubts").select("id").eq("id", doubtA)).data).toEqual([]);
  });

  it("doubts: the course teacher and its TAs read the course's; not another course's", async () => {
    expect(idsOf((await clients.teacher.from("doubts").select("id")).data)).toEqual([doubtA, doubtB].sort());
    expect(idsOf((await clients.ta.from("doubts").select("id")).data)).toEqual([doubtA, doubtB].sort());
    expect(idsOf((await clients.otherTa.from("doubts").select("id")).data)).toEqual([otherDoubt]);
    expect(idsOf((await clients.otherTeacher.from("doubts").select("id")).data)).toEqual([otherDoubt]);
  });

  it("doubts: only the server writes", async () => {
    const write = await clients.studentA.from("doubts").insert(doubt(ids.studentA, courseId, "Sneaky"));
    expect(write.error).not.toBeNull();
    const answer = await clients.ta.from("doubts").update({ answer: "x", status: "answered" }).eq("id", doubtA).select();
    expect(answer.data ?? []).toEqual([]);
  });

  it("TAs: the teacher sees their course's TAs; a TA sees only their own row; students see none", async () => {
    expect((await clients.teacher.from("course_tas").select("user_id")).data).toEqual([{ user_id: ids.ta }]);
    expect((await clients.ta.from("course_tas").select("user_id")).data).toEqual([{ user_id: ids.ta }]);
    expect((await clients.studentA.from("course_tas").select("user_id")).data).toEqual([]);
    const self = await clients.studentA.from("course_tas").insert({ course_id: courseId, user_id: ids.studentA });
    expect(self.error).not.toBeNull();
  });

  it("TAs: being a TA opens no other course data (chats, messages, flags)", async () => {
    expect((await clients.ta.from("conversations").select("id")).data).toEqual([]);
    expect((await clients.ta.from("messages").select("id")).data).toEqual([]);
    expect((await clients.ta.from("weekly_metrics").select("student_id")).data).toEqual([]);
  });

  it("announcements: enrolled students, the teacher and TAs read them; other courses don't", async () => {
    for (const key of ["studentA", "teacher", "ta"]) {
      expect(idsOf((await clients[key].from("course_announcements").select("id")).data)).toEqual([announcementId]);
    }
    expect(idsOf((await clients.outsider.from("course_announcements").select("id")).data)).not.toContain(announcementId);
    const write = await clients.teacher.from("course_announcements").insert({ course_id: courseId, title: "x", body: "y" });
    expect(write.error).not.toBeNull();
  });

  it("notifications: own only; read_at is the only thing a user can change", async () => {
    expect(idsOf((await clients.studentA.from("notifications").select("id")).data)).toEqual([noticeA]);
    const read = await clients.studentA.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", noticeA).select("id");
    expect(read.error).toBeNull();
    expect(read.data).toEqual([{ id: noticeA }]);
    const title = await clients.studentA.from("notifications").update({ title: "changed" }).eq("id", noticeA);
    expect(title.error).not.toBeNull();
    const other = await clients.studentA.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ids.studentB).select("id");
    expect(other.data ?? []).toEqual([]);
    const write = await clients.studentA.from("notifications").insert({ user_id: ids.studentA, kind: "announcement", title: "x" });
    expect(write.error).not.toBeNull();
  });

  it("find_user_by_email: only the service role may look people up", async () => {
    const asUser = await clients.teacher.rpc("find_user_by_email", { p_email: `doubts-ta-${run}@test.safesight.in` });
    expect(asUser.error).not.toBeNull();
    const asServer = await admin.rpc("find_user_by_email", { p_email: `DOUBTS-TA-${run}@test.safesight.in` });
    expect(asServer.data).toEqual([{ id: ids.ta, full_name: "Test ta", role: "student" }]);
  });
});
