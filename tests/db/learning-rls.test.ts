/**
 * Row-level security for the S17 learning tools: practice_sets,
 * practice_items, practice_item_keys, explain_backs, sage_recaps,
 * mistake_patterns, topic_mastery, learning_offers and ai_usage.
 * Runs against local Supabase; skipped when it is not running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
const password = `test-${randomUUID()}`;
const run = randomUUID().slice(0, 8);

describe.skipIf(!env)("learning tools row-level security", () => {
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient> = {};
  let courseId: string;
  let otherCourseId: string;
  let setId: string;
  let itemId: string;

  async function makeUser(key: string, role: "student" | "teacher") {
    const email = `learn-${key}-${run}@test.safesight.in`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${key}` },
    });
    if (error) throw error;
    ids[key] = data.user.id;
    await admin.from("profiles").update({ role }).eq("id", data.user.id);
    const client = createClient(env!.url, env!.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    clients[key] = client;
  }

  async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
    const { data, error } = await p;
    if (error || data === null || data === undefined) throw new Error(error?.message ?? "no data");
    return data;
  }

  async function ok(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    if (error) throw new Error(error.message);
  }

  beforeAll(async () => {
    admin = createClient(env!.url, env!.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await makeUser("studentA", "student");
    await makeUser("studentB", "student");
    await makeUser("teacher", "teacher");
    await makeUser("otherTeacher", "teacher");

    courseId = (await must(admin.from("courses").insert({ teacher_id: ids.teacher, name: "Learning course" }).select().single())).id;
    otherCourseId = (await must(admin.from("courses").insert({ teacher_id: ids.otherTeacher, name: "Other course" }).select().single())).id;
    await ok(
      admin.from("enrollments").insert([
        { course_id: courseId, student_id: ids.studentA },
        { course_id: courseId, student_id: ids.studentB },
        { course_id: otherCourseId, student_id: ids.studentA },
      ]),
    );
    const conversation = await must(
      admin.from("conversations").insert({ student_id: ids.studentA, course_id: courseId }).select("id").single(),
    );

    const set = await must(
      admin
        .from("practice_sets")
        .insert({ student_id: ids.studentA, course_id: courseId, topic: "Entropy", topic_key: "entropy" })
        .select("id")
        .single(),
    );
    setId = set.id;
    const item = await must(
      admin.from("practice_items").insert({ set_id: setId, position: 1, difficulty: "warm_up", question: "What is entropy?" }).select("id").single(),
    );
    itemId = item.id;
    await ok(admin.from("practice_item_keys").insert({ item_id: itemId, solution: "A measure of spread.", final_answer: "spread" }));
    await ok(
      admin.from("explain_backs").insert({
        student_id: ids.studentA,
        course_id: courseId,
        conversation_id: conversation.id,
        topic: "Entropy",
        topic_key: "entropy",
        explanation: "Entropy is how spread out energy is.",
        score: 0.7,
        feedback: "Good start.",
      }),
    );
    const now = new Date().toISOString();
    await ok(
      admin.from("sage_recaps").insert({
        student_id: ids.studentA,
        course_id: courseId,
        conversation_id: conversation.id,
        title: "Entropy",
        learned: ["You saw that energy spreads out."],
        flashcards: [{ front: "What is entropy?", back: "Spread." }],
        from_at: now,
        to_at: now,
        messages: 4,
      }),
    );
    await ok(
      admin.from("mistake_patterns").insert({
        student_id: ids.studentA,
        course_id: courseId,
        label: "Sign errors in entropy change",
        label_key: "sign errors in entropy change",
      }),
    );
    await ok(
      admin.from("topic_mastery").insert([
        { student_id: ids.studentA, course_id: courseId, topic_key: "entropy", topic: "Entropy", mastery: 0.6, evidence: 2, last_source: "practice" },
        { student_id: ids.studentA, course_id: otherCourseId, topic_key: "bernoulli", topic: "Bernoulli", mastery: 0.4, evidence: 1, last_source: "practice" },
      ]),
    );
    await ok(admin.from("learning_offers").insert({ student_id: ids.studentA, course_id: courseId, topic_key: "entropy", kind: "refresher" }));
    await ok(admin.from("ai_usage").insert({ user_id: ids.studentA, feature: "practice_generate", input_tokens: 10, output_tokens: 20 }));
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("ai_usage").delete().in("user_id", Object.values(ids));
    await admin.from("courses").delete().in("id", [courseId, otherCourseId].filter(Boolean));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  const ownTables = ["practice_sets", "explain_backs", "sage_recaps", "mistake_patterns", "learning_offers"] as const;

  it("a student reads their own learning rows", async () => {
    for (const table of ownTables) {
      const { data, error } = await clients.studentA.from(table).select("*");
      expect(error, table).toBeNull();
      expect(data?.length, table).toBe(1);
    }
    const { data: items } = await clients.studentA.from("practice_items").select("id, question");
    expect(items?.map((i) => i.id)).toEqual([itemId]);
    const { data: mastery } = await clients.studentA.from("topic_mastery").select("topic_key");
    expect(mastery?.length).toBe(2);
    const { data: usage } = await clients.studentA.from("ai_usage").select("feature");
    expect(usage?.length).toBe(1);
  });

  it("another student reads none of them", async () => {
    for (const table of [...ownTables, "practice_items", "topic_mastery", "ai_usage"] as const) {
      const { data } = await clients.studentB.from(table).select("*");
      expect(data?.length ?? 0, table).toBe(0);
    }
  });

  it("nobody but the server reads practice solutions before they're answered", async () => {
    for (const who of ["studentA", "studentB", "teacher"]) {
      const { data } = await clients[who].from("practice_item_keys").select("*");
      expect(data?.length ?? 0, who).toBe(0);
    }
  });

  it("the course teacher sees mastery as a summary, for their own course only", async () => {
    const { data } = await clients.teacher.from("topic_mastery").select("course_id, topic_key, mastery");
    expect(data?.map((m) => m.topic_key)).toEqual(["entropy"]);
    const { data: other } = await clients.otherTeacher.from("topic_mastery").select("course_id, topic_key");
    expect(other?.map((m) => m.topic_key)).toEqual(["bernoulli"]);
  });

  it("teachers can't read practice answers, explanations, recaps or the mistake log", async () => {
    for (const table of [...ownTables, "practice_items", "ai_usage"] as const) {
      const { data } = await clients.teacher.from(table).select("*");
      expect(data?.length ?? 0, table).toBe(0);
    }
  });

  it("students can't write their own scores or answers", async () => {
    const insert = await clients.studentA
      .from("topic_mastery")
      .insert({ student_id: ids.studentA, course_id: courseId, topic_key: "free", topic: "Free", mastery: 1, last_source: "practice" });
    expect(insert.error).not.toBeNull();
    const update = await clients.studentA.from("topic_mastery").update({ mastery: 1 }).eq("topic_key", "entropy").select();
    expect(update.data?.length ?? 0).toBe(0);
    const answer = await clients.studentA.from("practice_items").update({ score: 1, verdict: "correct" }).eq("id", itemId).select();
    expect(answer.data?.length ?? 0).toBe(0);
    const usage = await clients.studentA.from("ai_usage").insert({ user_id: ids.studentA, feature: "recap" });
    expect(usage.error).not.toBeNull();
    const set = await clients.studentA
      .from("practice_sets")
      .insert({ student_id: ids.studentA, course_id: courseId, topic: "X", topic_key: "x" });
    expect(set.error).not.toBeNull();
  });
});
