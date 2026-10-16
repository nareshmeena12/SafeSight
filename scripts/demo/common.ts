/**
 * Shared by the demo scripts (demo-data, demo-reset): env, the service-role
 * client and the fixed ids from scripts/seed.mts.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

export const db = createClient<Database>(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const COURSE = {
  thermo: "00000000-0000-4000-8000-000000000101",
  fluids: "00000000-0000-4000-8000-000000000102",
} as const;
export const DEMO_COURSES = [COURSE.thermo, COURSE.fluids];

/** The demo assignment Riya uses on stage (PLAN.md §12). */
export const PS3_ID = "00000000-0000-4000-8000-000000000201";
export const PS3_TITLE = "Thermodynamics problem set 3";

/** The ME201 lecture notes PDF the demo data uploads (public/demo/…). */
export const NOTES_MATERIAL_ID = "00000000-0000-4000-8000-000000000301";
export const NOTES_TITLE = "ME201 lecture notes (weeks 1–7)";
export const NOTES_FILE = "public/demo/me201-thermodynamics-notes.pdf";
export const MATERIALS_BUCKET = "course-materials";

export const RIYA_EMAIL = "riya@demo.safesight.in";
export const DEMO_EMAIL = /@demo\.safesight\.in$/i;

/** Seeded student ids by email (only the @demo.safesight.in accounts). */
export async function demoStudents(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email && DEMO_EMAIL.test(u.email)) out.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }
  const { data: profiles, error } = await db.from("profiles").select("id, role").in("id", [...out.values()]);
  if (error) throw error;
  const students = new Set(profiles.filter((p) => p.role === "student").map((p) => p.id));
  for (const [email, id] of out) if (!students.has(id)) out.delete(email);
  return out;
}

export function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** Inserts rows in batches (PostgREST request size). */
export async function insertAll<T extends keyof Database["public"]["Tables"]>(
  table: T,
  rows: Database["public"]["Tables"][T]["Insert"][],
  batch = 500,
) {
  for (let i = 0; i < rows.length; i += batch) {
    // The generic insert type doesn't narrow per table; rows are typed by the caller.
    const { error } = await db.from(table).insert(rows.slice(i, i + batch) as never);
    fail(`insert ${table}`, error);
  }
}

/** Deletes in chunks of ids (URL length). */
export async function deleteIn<T extends keyof Database["public"]["Tables"]>(table: T, column: string, ids: string[]) {
  for (let i = 0; i < ids.length; i += 100) {
    // Column names aren't narrowed per table here; callers pass real columns.
    const { error } = await db.from(table).delete().in(column as never, ids.slice(i, i + 100) as never);
    fail(`delete ${table}`, error);
  }
}

export async function refreshMetrics(weeks: number) {
  const { data, error } = await db.rpc("refresh_weekly_metrics", { p_weeks: weeks });
  fail("refresh_weekly_metrics", error);
  return data;
}
