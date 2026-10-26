/**
 * S23: departments, ai_policies, teacher_invites and the admin functions.
 * Admins see their own institution only, aggregates only; teachers can only
 * be stricter than their department's AI policy; invites are claimed by the
 * confirmed email. Runs against local Supabase; skipped when it is not running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

type WeeklyRow = { department_id: string | null; avg_reliance: number | null; high_reliance_share: number | null };
type IdRow = { id: string; outside_policy?: number };

const env = supabaseTestEnv();
if (!env) console.warn("Skipping institution admin RLS tests: local Supabase is not running (pnpm db:start).");

const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);
const emailFor = (key: string) => `admin-${key}-${run}@test.safesight.in`;

type Role = "student" | "teacher" | "admin";

describe.skipIf(!env)("institution admin RLS", () => {
  let service: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let instA: string;
  let instB: string;
  let deptMech: string;
  let deptCivil: string;
  let deptOther: string;
  let courseA: string;
  let courseB: string;
  const institutions: string[] = [];

  async function makeUser(key: string, role: Role, institution: string | null, signIn = true) {
    const { data, error } = await service.auth.admin.createUser({
      email: emailFor(key),
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${key}` },
    });
    if (error) throw error;
    ids[key] = data.user.id;
    const { error: roleError } = await service
      .from("profiles")
      .update({ role, institution_id: institution })
      .eq("id", data.user.id);
    if (roleError) throw roleError;
    if (!signIn) return;
    const client = createClient(env!.url, env!.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email: emailFor(key), password });
    if (signInError) throw signInError;
    clients[key] = client;
  }

  async function insert<T = { id: string }>(table: string, row: object): Promise<T> {
    const { data, error } = await service.from(table).insert(row).select().single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as T;
  }

  beforeAll(async () => {
    service = createClient(env!.url, env!.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    instA = (await insert("institutions", { name: `Admin test A ${run}` })).id;
    instB = (await insert("institutions", { name: `Admin test B ${run}` })).id;
    institutions.push(instA, instB);
    deptMech = (await insert("departments", { institution_id: instA, name: "Mechanical", code: "ME" })).id;
    deptCivil = (await insert("departments", { institution_id: instA, name: "Civil", code: "CE" })).id;
    deptOther = (await insert("departments", { institution_id: instB, name: "Mechanical" })).id;

    await makeUser("admin", "admin", instA);
    await makeUser("otherAdmin", "admin", instB);
    await makeUser("teacher", "teacher", instA);
    await makeUser("otherTeacher", "teacher", instB);
    await makeUser("student", "student", instA);
    await makeUser("student2", "student", instA, false);
    await makeUser("student3", "student", instA, false);
    await service.from("profiles").update({ department_id: deptMech }).eq("id", ids.teacher);

    // The course takes the teacher's institution and department.
    courseA = (await insert<{ id: string; institution_id: string; department_id: string }>("courses", {
      teacher_id: ids.teacher,
      name: "Admin test course",
    })).id;
    courseB = (await insert("courses", { teacher_id: ids.otherTeacher, name: "Other institution course" })).id;
    const { error } = await service.from("enrollments").insert([
      { course_id: courseA, student_id: ids.student },
      { course_id: courseA, student_id: ids.student2 },
      { course_id: courseA, student_id: ids.student3 },
    ]);
    if (error) throw error;

    // A chat so adoption has something to count, and weekly scores for 3 students.
    const convo = await insert("conversations", { student_id: ids.student, course_id: courseA });
    await insert("messages", { conversation_id: convo.id, role: "user", content: "What is entropy?", intent: "concept_question" });
    const monday = new Date();
    const ist = new Date(monday.getTime() + 5.5 * 3600_000);
    ist.setUTCDate(ist.getUTCDate() - ((ist.getUTCDay() + 6) % 7));
    const week = ist.toISOString().slice(0, 10);
    const { error: wmError } = await service.from("weekly_metrics").insert(
      ["student", "student2", "student3"].map((k, i) => ({
        student_id: ids[k],
        course_id: courseA,
        week,
        messages: 3,
        reliance_score: [20, 50, 80][i],
      })),
    );
    if (wmError) throw wmError;

    await insert("ai_policies", {
      institution_id: instA,
      department_id: deptMech,
      allowed_modes: ["learn", "exam"],
      default_mode: "learn",
      max_hint_level: 2,
      worked_examples: false,
      lab_mode_allowed: false,
    });
    await insert("ai_policies", { institution_id: instB, department_id: null });
  });

  afterAll(async () => {
    if (!service) return;
    for (const id of Object.values(ids)) await service.auth.admin.deleteUser(id);
    for (const id of institutions) await service.from("institutions").delete().eq("id", id);
  });

  it("gives new courses the teacher's institution and department", async () => {
    const { data } = await service.from("courses").select("institution_id, department_id").eq("id", courseA).single();
    expect(data).toEqual({ institution_id: instA, department_id: deptMech });
  });

  it("lets institution members read their departments, not another institution's", async () => {
    const { data } = await clients.teacher.from("departments").select("id");
    const seen = (data ?? []).map((d) => d.id);
    expect(seen).toEqual(expect.arrayContaining([deptMech, deptCivil]));
    expect(seen).not.toContain(deptOther);
  });

  it("lets only the institution's admin write departments and policies", async () => {
    const byTeacher = await clients.teacher.from("departments").insert({ institution_id: instA, name: "Teacher dept" });
    expect(byTeacher.error).not.toBeNull();
    const intoOther = await clients.admin.from("departments").insert({ institution_id: instB, name: "Sneaky" });
    expect(intoOther.error).not.toBeNull();
    const ok = await clients.admin.from("departments").insert({ institution_id: instA, name: "Electrical" }).select("id").single();
    expect(ok.error).toBeNull();

    const teacherPolicy = await clients.teacher
      .from("ai_policies")
      .update({ max_hint_level: 4 })
      .eq("department_id", deptMech)
      .select("id");
    expect(teacherPolicy.data ?? []).toHaveLength(0);
    const otherAdmin = await clients.otherAdmin
      .from("ai_policies")
      .update({ max_hint_level: 4 })
      .eq("department_id", deptMech)
      .select("id");
    expect(otherAdmin.data ?? []).toHaveLength(0);
    const crossDept = await clients.admin
      .from("ai_policies")
      .insert({ institution_id: instA, department_id: deptOther });
    expect(crossDept.error).not.toBeNull();
  });

  it("keeps policies from students and other institutions", async () => {
    const { data: student } = await clients.student.from("ai_policies").select("id");
    expect(student ?? []).toHaveLength(0);
    const { data: other } = await clients.otherTeacher.from("ai_policies").select("department_id");
    expect((other ?? []).map((p) => p.department_id)).toEqual([null]);
  });

  it("returns the course's policy to its teacher only", async () => {
    const { data } = await clients.teacher.rpc("course_ai_policy", { p_course_id: courseA });
    expect(data?.[0]).toMatchObject({ scope: "department", department_name: "Mechanical", max_hint_level: 2 });
    const { data: outsider } = await clients.otherTeacher.rpc("course_ai_policy", { p_course_id: courseA });
    expect(outsider ?? []).toHaveLength(0);
  });

  it("lets teachers be stricter than the policy but not looser", async () => {
    const assist = await clients.teacher
      .from("assignments")
      .insert({ course_id: courseA, title: "Assist work", ai_mode: "assist", max_hint_level: 2, worked_examples: false });
    expect(assist.error?.message).toMatch(/ai_policy/);
    const hint = await clients.teacher
      .from("assignments")
      .insert({ course_id: courseA, title: "Too many hints", ai_mode: "learn", max_hint_level: 4, worked_examples: false });
    expect(hint.error?.message).toMatch(/ai_policy/);
    const examples = await clients.teacher
      .from("assignments")
      .insert({ course_id: courseA, title: "Examples", ai_mode: "learn", max_hint_level: 2, worked_examples: true });
    expect(examples.error?.message).toMatch(/ai_policy/);
    // Exam mode ignores the hint settings (Sage is off).
    const exam = await clients.teacher
      .from("assignments")
      .insert({ course_id: courseA, title: "Exam", ai_mode: "exam", max_hint_level: 4, worked_examples: true })
      .select("id")
      .single();
    expect(exam.error).toBeNull();
    const strict = await clients.teacher
      .from("assignments")
      .insert({ course_id: courseA, title: "Strict", ai_mode: "learn", max_hint_level: 1, worked_examples: false })
      .select("id")
      .single();
    expect(strict.error).toBeNull();
    const looser = await clients.teacher.from("assignments").update({ max_hint_level: 3 }).eq("id", strict.data!.id);
    expect(looser.error?.message).toMatch(/ai_policy/);
    const toLearn = await clients.teacher.from("assignments").update({ ai_mode: "learn" }).eq("id", exam.data!.id);
    expect(toLearn.error?.message).toMatch(/ai_policy/);
  });

  it("allows anything when the admin lets teachers loosen the policy", async () => {
    await service.from("ai_policies").update({ teachers_can_loosen: true }).eq("department_id", deptMech);
    const res = await clients.teacher
      .from("assignments")
      .insert({ course_id: courseA, title: "Assist ok", ai_mode: "assist", max_hint_level: 4, worked_examples: true });
    expect(res.error).toBeNull();
    await service.from("ai_policies").update({ teachers_can_loosen: false }).eq("department_id", deptMech);
  });

  it("blocks Lab Mode sessions when the department doesn't allow them", async () => {
    const starts = new Date(Date.now() + 60_000);
    const res = await clients.teacher.from("lab_sessions").insert({
      course_id: courseA,
      created_by: ids.teacher,
      title: "Lab exam",
      code: String(100000 + Math.floor(Math.random() * 899999)),
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 3600_000).toISOString(),
    });
    expect(res.error?.message).toMatch(/ai_policy/);
  });

  it("stops teachers moving their course to another department or institution", async () => {
    const dept = await clients.teacher.from("courses").update({ department_id: deptCivil }).eq("id", courseA);
    expect(dept.error).not.toBeNull();
    const inst = await clients.teacher.from("courses").update({ institution_id: instB }).eq("id", courseA);
    expect(inst.error).not.toBeNull();
    const rename = await clients.teacher.from("courses").update({ name: "Renamed course" }).eq("id", courseA).select("id");
    expect(rename.data).toHaveLength(1);
  });

  it("lets admins read staff and courses of their institution only, never students", async () => {
    const { data: profiles } = await clients.admin.from("profiles").select("id, role");
    const seen = (profiles ?? []).map((p) => p.id);
    expect(seen).toContain(ids.teacher);
    expect(seen).not.toContain(ids.student);
    expect(seen).not.toContain(ids.otherTeacher);

    const { data: courses } = await clients.admin.from("courses").select("id");
    const courseIds = (courses ?? []).map((c) => c.id);
    expect(courseIds).toContain(courseA);
    expect(courseIds).not.toContain(courseB);

    const { data: messages } = await clients.admin.from("messages").select("id");
    expect(messages ?? []).toHaveLength(0);
    const { data: metrics } = await clients.admin.from("weekly_metrics").select("student_id");
    expect(metrics ?? []).toHaveLength(0);
  });

  it("returns aggregates to admins and nothing to anyone else", async () => {
    const { data: adoption } = await clients.admin.rpc("admin_adoption", { p_weeks: 2 });
    expect(adoption).toHaveLength(2);
    expect(adoption!.at(-1)!.active_students).toBeGreaterThanOrEqual(1);

    const { data: weekly } = await clients.admin.rpc("admin_department_weekly", { p_weeks: 1 });
    const mech = (weekly as WeeklyRow[]).find((r) => r.department_id === deptMech);
    expect(mech).toMatchObject({ students: 3, scored_students: 3 });
    expect(mech!.avg_reliance).toBeCloseTo(50);

    const { data: courses } = await clients.admin.rpc("admin_courses");
    expect((courses as IdRow[]).map((c) => c.id)).toEqual([courseA]);
    // "Assist ok" was made while loosening was allowed: it now sits outside the policy.
    expect((courses as IdRow[])[0].outside_policy).toBe(1);
    const { data: staff } = await clients.admin.rpc("admin_staff");
    expect((staff as IdRow[]).map((s) => s.id)).toEqual(expect.arrayContaining([ids.admin, ids.teacher]));
    expect((staff as IdRow[]).map((s) => s.id)).not.toContain(ids.student);

    for (const key of ["teacher", "student", "otherAdmin"] as const) {
      const { data } = await clients[key].rpc("admin_courses");
      expect(((data ?? []) as IdRow[]).map((c) => c.id)).not.toContain(courseA);
    }
    const { data: teacherAdoption } = await clients.teacher.rpc("admin_adoption", { p_weeks: 2 });
    expect(teacherAdoption ?? []).toHaveLength(0);
  });

  it("hides the average Reliance Score for fewer than 3 students", async () => {
    await service.from("weekly_metrics").delete().eq("student_id", ids.student3);
    const { data: weekly } = await clients.admin.rpc("admin_department_weekly", { p_weeks: 1 });
    const mech = (weekly as WeeklyRow[]).find((r) => r.department_id === deptMech);
    expect(mech!.avg_reliance).toBeNull();
    expect(mech!.high_reliance_share).toBeNull();
  });

  it("lets admins move teachers and courses between their own departments only", async () => {
    const moved = await clients.admin.rpc("admin_set_course_department", { p_course_id: courseA, p_department_id: deptCivil });
    expect(moved.data).toBe(true);
    const foreign = await clients.admin.rpc("admin_set_course_department", { p_course_id: courseB, p_department_id: null });
    expect(foreign.data).toBe(false);
    const otherDept = await clients.admin.rpc("admin_set_teacher_department", {
      p_teacher_id: ids.teacher,
      p_department_id: deptOther,
    });
    expect(otherDept.data).toBe(false);
    const byTeacher = await clients.teacher.rpc("admin_set_teacher_department", {
      p_teacher_id: ids.teacher,
      p_department_id: deptCivil,
    });
    expect(byTeacher.data).toBe(false);
    const ok = await clients.admin.rpc("admin_set_teacher_department", { p_teacher_id: ids.teacher, p_department_id: deptCivil });
    expect(ok.data).toBe(true);
    await clients.admin.rpc("admin_set_course_department", { p_course_id: courseA, p_department_id: deptMech });
  });

  it("claims a teacher invite for the confirmed email and keeps invites to their institution", async () => {
    await insert("teacher_invites", { institution_id: instA, department_id: deptCivil, email: emailFor("newbie") });
    await insert("teacher_invites", { institution_id: instB, email: emailFor("enrolled") });
    await makeUser("newbie", "student", null);
    await makeUser("enrolled", "student", null);
    await service.from("enrollments").insert({ course_id: courseB, student_id: ids.enrolled });

    const claimed = await clients.newbie.rpc("claim_teacher_invites");
    expect(claimed.data).toBe("teacher");
    const { data: profile } = await service.from("profiles").select("role, institution_id, department_id").eq("id", ids.newbie).single();
    expect(profile).toEqual({ role: "teacher", institution_id: instA, department_id: deptCivil });

    // A student already in a course stays a student.
    const kept = await clients.enrolled.rpc("claim_teacher_invites");
    expect(kept.data).toBe("student");

    const { data: invitesA } = await clients.admin.from("teacher_invites").select("email, status");
    expect(invitesA).toEqual([{ email: emailFor("newbie"), status: "joined" }]);
    const { data: invitesTeacher } = await clients.teacher.from("teacher_invites").select("id");
    expect(invitesTeacher ?? []).toHaveLength(0);
    const write = await clients.admin.from("teacher_invites").insert({ institution_id: instA, email: "x@test.safesight.in" });
    expect(write.error).not.toBeNull();
  });
});
