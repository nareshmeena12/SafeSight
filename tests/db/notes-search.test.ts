/**
 * Notes search ranking (S12): match_material_chunks() weighs rare words, so
 * the page that is about the question beats pages full of common words.
 * Runs against local Supabase; skipped when it is not running.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseTestEnv } from "./supabase-test-env";

const env = supabaseTestEnv();
if (!env) console.warn("Skipping notes search tests: local Supabase is not running (pnpm db:start).");

describe.skipIf(!env)("match_material_chunks keyword ranking", () => {
  let admin: SupabaseClient<Database>;
  let teacherId: string;
  let courseId: string;

  beforeAll(async () => {
    admin = createClient<Database>(env!.url, env!.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: user, error } = await admin.auth.admin.createUser({
      email: `search-${randomUUID().slice(0, 8)}@test.safesight.in`,
      password: `test-${randomUUID()}`,
      email_confirm: true,
    });
    if (error) throw error;
    teacherId = user.user.id;
    await admin.from("profiles").update({ role: "teacher" }).eq("id", teacherId);
    const { data: course } = await admin.from("courses").insert({ teacher_id: teacherId, name: "Search course" }).select().single();
    courseId = course!.id;
    const { data: material } = await admin
      .from("materials")
      .insert({ course_id: courseId, title: "Notes", file_path: `${courseId}/notes.pdf`, status: "ready" })
      .select()
      .single();
    await admin.from("material_chunks").insert([
      {
        material_id: material!.id,
        page: 7,
        content:
          "Moving boundary work. The work done by a moving boundary is the area under the process curve. For a constant-pressure process the work is P times the change in volume. Work in an isothermal process. Work, work, work.",
      },
      {
        material_id: material!.id,
        page: 12,
        content: "Polytropic processes follow PV^n = constant. The boundary work for a polytropic process is mR(T2 - T1)/(1 - n).",
      },
      {
        material_id: material!.id,
        page: 3,
        content: "A process is a change of state. Work and heat cross the boundary of a closed system during a process.",
      },
    ]);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("courses").delete().eq("id", courseId);
    await admin.auth.admin.deleteUser(teacherId);
  });

  it("ranks the page with the rare query word first", async () => {
    const { data, error } = await admin.rpc("match_material_chunks", {
      p_course_id: courseId,
      p_query: "polytropic process boundary work",
      p_match_count: 3,
    });
    expect(error).toBeNull();
    expect(data?.map((r) => r.page)).toEqual([12, 7, 3]);
  });

  it("returns nothing for words that are not in the notes", async () => {
    const { data } = await admin.rpc("match_material_chunks", { p_course_id: courseId, p_query: "entropy", p_match_count: 3 });
    expect(data).toEqual([]);
  });
});
