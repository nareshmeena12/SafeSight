/**
 * Row-level security for Live Lab Mode (S13): lab_sessions, lab_seats,
 * lab_seat_tokens, lab_events, lab_reports and set_my_roll_number().
 * Runs against local Supabase; skipped when it is not running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);

function code() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

describe.skipIf(!env)("Live Lab row-level security", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let courseId: string;
  let otherCourseId: string;
  let sessionId: string;
  let seatA: string;
  let seatB: string;

  async function makeUser(key: string, role: "student" | "teacher") {
    const email = `lab-${key}-${run}@test.safesight.in`;
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

    const course = await admin.from("courses").insert({ teacher_id: ids.teacher, name: "Lab course" }).select().single();
    courseId = course.data!.id;
    const other = await admin.from("courses").insert({ teacher_id: ids.otherTeacher, name: "Other course" }).select().single();
    otherCourseId = other.data!.id;
    await admin.from("enrollments").insert([
      { course_id: courseId, student_id: ids.studentA },
      { course_id: courseId, student_id: ids.studentB },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  it("a teacher creates a session for their own course only", async () => {
    const starts = new Date(Date.now() - 60_000).toISOString();
    const ends = new Date(Date.now() + 3_600_000).toISOString();
    const own = await clients.teacher
      .from("lab_sessions")
      .insert({ course_id: courseId, created_by: ids.teacher, title: "Lab exam", code: code(), starts_at: starts, ends_at: ends })
      .select("id")
      .single();
    expect(own.error).toBeNull();
    sessionId = own.data!.id;

    const foreign = await clients.teacher
      .from("lab_sessions")
      .insert({ course_id: otherCourseId, created_by: ids.teacher, title: "Not mine", code: code(), starts_at: starts, ends_at: ends });
    expect(foreign.error).not.toBeNull();

    const student = await clients.studentA
      .from("lab_sessions")
      .insert({ course_id: courseId, created_by: ids.studentA, title: "Mine", code: code(), starts_at: starts, ends_at: ends });
    expect(student.error).not.toBeNull();
  });

  it("only the server writes seats, tokens and events", async () => {
    const seat = await clients.studentA
      .from("lab_seats")
      .insert({ session_id: sessionId, roll_number: "A1", seat_label: "1", student_id: ids.studentA });
    expect(seat.error).not.toBeNull();
    const teacherSeat = await clients.teacher
      .from("lab_seats")
      .insert({ session_id: sessionId, roll_number: "A1", seat_label: "1" });
    expect(teacherSeat.error).not.toBeNull();

    const a = await admin
      .from("lab_seats")
      .insert({ session_id: sessionId, roll_number: "A1", seat_label: "1", student_id: ids.studentA })
      .select("id")
      .single();
    seatA = a.data!.id;
    const b = await admin
      .from("lab_seats")
      .insert({ session_id: sessionId, roll_number: "B2", seat_label: "2", student_id: ids.studentB })
      .select("id")
      .single();
    seatB = b.data!.id;
    await admin.from("lab_seat_tokens").insert({ seat_id: seatA, token_hash: `hash-${run}` });
    await admin.from("lab_events").insert([
      { session_id: sessionId, seat_id: seatA, type: "blocked_site", detail: { host: "chatgpt.com" } },
      { session_id: sessionId, seat_id: seatB, type: "paste", detail: { chars: 10 } },
    ]);
    await admin.from("lab_reports").insert([
      { seat_id: seatA, session_id: sessionId, student_id: ids.studentA, metrics: {}, summary: "A" },
      { seat_id: seatB, session_id: sessionId, student_id: ids.studentB, metrics: {}, summary: "B" },
    ]);

    const event = await clients.studentA
      .from("lab_events")
      .insert({ session_id: sessionId, seat_id: seatA, type: "joined" });
    expect(event.error).not.toBeNull();
    const report = await clients.teacher
      .from("lab_reports")
      .update({ summary: "changed" })
      .eq("seat_id", seatA)
      .select("seat_id");
    expect(report.data ?? []).toEqual([]);
  });

  it("nobody signed in can read seat tokens", async () => {
    for (const key of ["teacher", "studentA"]) {
      const { data } = await clients[key]!.from("lab_seat_tokens").select("token_hash");
      expect(data ?? []).toEqual([]);
    }
  });

  it("the course teacher sees every seat and event; another teacher sees nothing", async () => {
    const seats = await clients.teacher.from("lab_seats").select("id").eq("session_id", sessionId);
    expect(seats.data).toHaveLength(2);
    const events = await clients.teacher.from("lab_events").select("id").eq("session_id", sessionId);
    expect(events.data).toHaveLength(2);
    const reports = await clients.teacher.from("lab_reports").select("seat_id").eq("session_id", sessionId);
    expect(reports.data).toHaveLength(2);

    for (const table of ["lab_sessions", "lab_seats", "lab_events", "lab_reports"] as const) {
      const col = table === "lab_sessions" ? "id" : "session_id";
      const { data } = await clients.otherTeacher.from(table).select("*").eq(col, sessionId);
      expect(data).toEqual([]);
    }
  });

  it("a student sees their own seat, events and summary, not a classmate's", async () => {
    const seats = await clients.studentA.from("lab_seats").select("id").eq("session_id", sessionId);
    expect(seats.data?.map((s) => s.id)).toEqual([seatA]);
    const events = await clients.studentA.from("lab_events").select("seat_id").eq("session_id", sessionId);
    expect(events.data?.map((e) => e.seat_id)).toEqual([seatA]);
    const reports = await clients.studentA.from("lab_reports").select("summary");
    expect(reports.data?.map((r) => r.summary)).toEqual(["A"]);
    const session = await clients.studentA.from("lab_sessions").select("id").eq("id", sessionId);
    expect(session.data).toHaveLength(1);
  });

  it("a teacher may end a session but not change its code or course", async () => {
    const end = await clients.teacher
      .from("lab_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select("id");
    expect(end.data).toHaveLength(1);
    const recode = await clients.teacher.from("lab_sessions").update({ code: "000000" }).eq("id", sessionId);
    expect(recode.error).not.toBeNull();
    const move = await clients.teacher.from("lab_sessions").update({ course_id: otherCourseId }).eq("id", sessionId);
    expect(move.error).not.toBeNull();
    const other = await clients.otherTeacher
      .from("lab_sessions")
      .update({ ended_at: null })
      .eq("id", sessionId)
      .select("id");
    expect(other.data ?? []).toEqual([]);
  });

  it("students set their own roll number, normalised and checked", async () => {
    const ok = await clients.studentA.rpc("set_my_roll_number", { p_roll_number: " me 23b001 " });
    expect(ok.error).toBeNull();
    expect(ok.data).toBe("ME23B001");
    const bad = await clients.studentA.rpc("set_my_roll_number", { p_roll_number: "<b>" });
    expect(bad.error).not.toBeNull();
    const { data } = await admin.from("profiles").select("roll_number").eq("id", ids.studentA).single();
    expect(data!.roll_number).toBe("ME23B001");
    const direct = await clients.studentA.from("profiles").update({ roll_number: "X" }).eq("id", ids.studentA).select("id");
    expect(direct.data ?? []).toEqual([]);
  });
});
