/**
 * S25: roles at sign-up (SSO users start as students), the app_metadata copy
 * of the role, staff invites (apply_account_claims), allowed email domains
 * per institution (join_course) and RLS for institution_email_domains,
 * staff_invites and course_external_links.
 * Runs against local Supabase; skipped when it is not running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
if (!env) console.warn("Skipping sign-in and integrations tests: local Supabase is not running (pnpm db:start).");

const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);
const domainA = `college-${run}.test.in`;
const domainB = `other-${run}.test.in`;
const at = (key: string, domain = "test.safesight.in") => `sso-${key}-${run}@${domain}`;

describe.skipIf(!env)("sign-in rules and integrations RLS", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const emails: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  const extraUsers: string[] = [];
  let instA: string;
  let instB: string;
  let courseA: string;
  let courseB: string;

  const anonClient = () =>
    createClient(env!.url, env!.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

  async function makeUser(key: string, email: string, profile: { role: string; institution_id?: string | null }) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${key}` },
    });
    if (error) throw error;
    ids[key] = data.user.id;
    emails[key] = email;
    const { error: profileError } = await admin.from("profiles").update(profile).eq("id", data.user.id);
    if (profileError) throw profileError;
    const client = anonClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    clients[key] = client;
  }

  async function profileOf(id: string) {
    const { data } = await admin.from("profiles").select("role, institution_id, full_name").eq("id", id).single();
    return data!;
  }

  beforeAll(async () => {
    admin = createClient(env!.url, env!.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const insts = await admin
      .from("institutions")
      .insert([
        { name: `College A ${run}`, sign_up_domains_only: true },
        { name: `College B ${run}`, sign_up_domains_only: false },
      ])
      .select("id, name");
    if (insts.error) throw insts.error;
    instA = insts.data.find((i) => i.name.startsWith("College A"))!.id;
    instB = insts.data.find((i) => i.name.startsWith("College B"))!.id;
    const domains = await admin.from("institution_email_domains").insert([
      { domain: domainA, institution_id: instA },
      { domain: domainB, institution_id: instB },
    ]);
    if (domains.error) throw domains.error;

    await makeUser("adminA", at("admin-a", domainA), { role: "admin", institution_id: instA });
    await makeUser("adminB", at("admin-b", domainB), { role: "admin", institution_id: instB });
    await makeUser("teacherA", at("teacher-a", domainA), { role: "teacher", institution_id: instA });
    await makeUser("teacherB", at("teacher-b"), { role: "teacher", institution_id: instB });
    await makeUser("inside", at("inside", `students.${domainA}`), { role: "student" });
    await makeUser("outside", at("outside"), { role: "student", institution_id: null });
    await makeUser("invitee", at("invitee", domainA), { role: "student", institution_id: null });

    const courses = await admin
      .from("courses")
      .insert([
        { teacher_id: ids.teacherA, name: "Course A" },
        { teacher_id: ids.teacherB, name: "Course B", institution_id: instB },
      ])
      .select("id, name, join_code");
    if (courses.error) throw courses.error;
    courseA = courses.data.find((c) => c.name === "Course A")!.id;
    courseB = courses.data.find((c) => c.name === "Course B")!.id;

    const invites = await admin.from("staff_invites").insert([
      { institution_id: instA, email: emails.invitee, role: "teacher", invited_by: ids.adminA },
      { institution_id: instB, email: `nobody-${run}@${domainB}`, role: "teacher", invited_by: ids.adminB },
    ]);
    if (invites.error) throw invites.error;
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("courses").delete().in("id", [courseA, courseB].filter(Boolean));
    for (const id of [...Object.values(ids), ...extraUsers]) await admin.auth.admin.deleteUser(id);
    await admin.from("institutions").delete().in("id", [instA, instB].filter(Boolean));
  });

  it("sign-up: a password account may choose teacher; an SSO account starts as a student", async () => {
    const password1 = await admin.auth.admin.createUser({
      email: at("pw-teacher"),
      password,
      user_metadata: { full_name: "Pw Teacher", role: "teacher" },
    });
    expect(password1.error).toBeNull();
    extraUsers.push(password1.data.user!.id);
    expect((await profileOf(password1.data.user!.id)).role).toBe("teacher");

    // Google / Microsoft sign-ups carry the issuer in their identity data and their name in `name`
    // (the admin API can't create an OAuth user, so this is what Auth would store).
    const sso = await admin.auth.admin.createUser({
      email: at("sso-teacher"),
      email_confirm: true,
      user_metadata: { iss: "https://accounts.google.com", sub: "1234", provider_id: "1234", name: "Sso Person", role: "teacher" },
    });
    expect(sso.error).toBeNull();
    extraUsers.push(sso.data.user!.id);
    const ssoProfile = await profileOf(sso.data.user!.id);
    expect(ssoProfile.role).toBe("student");
    expect(ssoProfile.full_name).toBe("Sso Person");

    // A role the service role puts in app_metadata becomes the profile's role.
    const granted = await admin.auth.admin.createUser({
      email: at("granted"),
      email_confirm: true,
      app_metadata: { role: "teacher" },
    });
    expect(granted.error).toBeNull();
    extraUsers.push(granted.data.user!.id);
    expect((await profileOf(granted.data.user!.id)).role).toBe("teacher");
  });

  it("a confirmed account at an institution's domain joins that institution", async () => {
    const user = await admin.auth.admin.createUser({ email: at("domain", domainB), password, email_confirm: true });
    expect(user.error).toBeNull();
    extraUsers.push(user.data.user!.id);
    const client = anonClient();
    await client.auth.signInWithPassword({ email: at("domain", domainB), password });
    const res = await client.rpc("apply_account_claims");
    expect(res.data).toMatchObject({ role: "student", changed: true });
    expect((await profileOf(user.data.user!.id)).institution_id).toBe(instB);
  });

  it("the role is copied into app_metadata and follows changes", async () => {
    const before = await admin.auth.admin.getUserById(ids.teacherA);
    expect(before.data.user?.app_metadata.role).toBe("teacher");
    await admin.from("profiles").update({ role: "admin" }).eq("id", ids.teacherA);
    const after = await admin.auth.admin.getUserById(ids.teacherA);
    expect(after.data.user?.app_metadata.role).toBe("admin");
    await admin.from("profiles").update({ role: "teacher" }).eq("id", ids.teacherA);
  });

  it("apply_account_claims: an invited email becomes a teacher of that institution, once", async () => {
    const first = await clients.invitee.rpc("apply_account_claims");
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ role: "teacher", changed: true });
    const profile = await profileOf(ids.invitee);
    expect(profile).toMatchObject({ role: "teacher", institution_id: instA });
    const invite = await admin.from("staff_invites").select("status, user_id").eq("email", emails.invitee).single();
    expect(invite.data).toEqual({ status: "accepted", user_id: ids.invitee });
    const meta = await admin.auth.admin.getUserById(ids.invitee);
    expect(meta.data.user?.app_metadata.role).toBe("teacher");

    const again = await clients.invitee.rpc("apply_account_claims");
    expect(again.data).toMatchObject({ role: "teacher", changed: false });
  });

  it("apply_account_claims never lowers a role and fills the institution from the domain", async () => {
    const res = await clients.inside.rpc("apply_account_claims");
    expect(res.data).toMatchObject({ role: "student" });
    expect((await profileOf(ids.inside)).institution_id).toBe(instA);
    const adminRes = await clients.adminA.rpc("apply_account_claims");
    expect(adminRes.data).toMatchObject({ role: "admin" });
  });

  it("join_course: an institution that takes only its own domains refuses other emails", async () => {
    const { data: a } = await admin.from("courses").select("join_code").eq("id", courseA).single();
    const { data: b } = await admin.from("courses").select("join_code").eq("id", courseB).single();
    const refused = await clients.outside.rpc("join_course", { p_join_code: a!.join_code });
    expect(refused.error?.message).toContain("email_domain_not_allowed");
    const inside = await clients.inside.rpc("join_course", { p_join_code: a!.join_code });
    expect(inside.error).toBeNull();
    expect(inside.data).toBe(courseA);
    // College B doesn't restrict, so anyone with the code may join.
    const open = await clients.outside.rpc("join_course", { p_join_code: b!.join_code });
    expect(open.data).toBe(courseB);
  });

  it("institution_email_domains: members read their own institution's; nobody writes", async () => {
    const own = await clients.teacherA.from("institution_email_domains").select("domain");
    expect(own.data?.map((d) => d.domain)).toEqual([domainA]);
    const outside = await clients.outside.from("institution_email_domains").select("domain");
    expect(outside.data).toEqual([]);
    const write = await clients.adminA.from("institution_email_domains").insert({ domain: `x-${run}.test.in`, institution_id: instA });
    expect(write.error).not.toBeNull();
  });

  it("staff_invites: the institution's admin and the invitee read; others don't; nobody writes", async () => {
    const adminA = await clients.adminA.from("staff_invites").select("institution_id");
    expect(new Set(adminA.data?.map((r) => r.institution_id))).toEqual(new Set([instA]));
    const adminB = await clients.adminB.from("staff_invites").select("institution_id");
    expect(new Set(adminB.data?.map((r) => r.institution_id))).toEqual(new Set([instB]));
    const teacher = await clients.teacherB.from("staff_invites").select("id");
    expect(teacher.data).toEqual([]);
    const invitee = await clients.invitee.from("staff_invites").select("email");
    expect(invitee.data).toEqual([{ email: emails.invitee }]);
    const write = await clients.adminA
      .from("staff_invites")
      .insert({ institution_id: instA, email: `w-${run}@${domainA}`, role: "admin" });
    expect(write.error).not.toBeNull();
  });

  it("course_external_links: only the course teacher reads and writes", async () => {
    const own = await clients.teacherA
      .from("course_external_links")
      .insert({ course_id: courseA, provider: "google_classroom", external_id: "123", external_name: "Class A" })
      .select("id")
      .single();
    expect(own.error).toBeNull();
    const other = await clients.teacherB
      .from("course_external_links")
      .insert({ course_id: courseA, provider: "moodle", external_id: "9" });
    expect(other.error).not.toBeNull();
    for (const key of ["teacherB", "inside", "adminA"]) {
      const read = await clients[key].from("course_external_links").select("id").eq("course_id", courseA);
      expect(read.data).toEqual([]);
    }
    const mine = await clients.teacherA.from("course_external_links").select("external_id").eq("course_id", courseA);
    expect(mine.data).toEqual([{ external_id: "123" }]);
  });

  it("profiles stay unwritable from the browser", async () => {
    const { data } = await clients.outside.from("profiles").update({ role: "teacher" }).eq("id", ids.outside).select("id");
    expect(data ?? []).toEqual([]);
    expect((await profileOf(ids.outside)).role).toBe("student");
  });
});
