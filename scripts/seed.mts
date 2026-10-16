/**
 * Seeds demo data: one institution, one teacher, two courses with
 * assignments, 30 students (invented Indian names), plus the admin.
 *
 *   pnpm seed
 *
 * Idempotent: rows have fixed ids or natural keys and are upserted. Users are
 * created through the Auth admin API; a user that already exists keeps its
 * password (pass --reset-passwords to set it to SEED_PASSWORD again).
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (real env
 * first, then .env.local / .env). Password for new users: SEED_PASSWORD, or
 * safesight-demo against a local Supabase. On a hosted project without
 * SEED_PASSWORD, new users get a random password nobody knows (they appear in
 * rosters but cannot log in; existing demo logins are unchanged).
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url);
const resetPasswords = process.argv.includes("--reset-passwords");
const seedPassword = process.env.SEED_PASSWORD ?? (isLocal ? "safesight-demo" : undefined);
if (seedPassword !== undefined && seedPassword.length < 8) {
  console.error("SEED_PASSWORD must be at least 8 characters.");
  process.exit(1);
}
if (resetPasswords && !seedPassword) {
  console.error("--reset-passwords needs SEED_PASSWORD.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ------------------------------------------------------------------ data
// Invented names only (CLAUDE.md). Fixed ids keep the seed idempotent.

const institution = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Shivalik Institute of Technology",
  city: "Mandi",
};

type Role = "student" | "teacher" | "admin";
type DemoUser = { email: string; fullName: string; role: Role };

const teacher: DemoUser = { email: "teacher@demo.safesight.in", fullName: "Kavita Sharma", role: "teacher" };
const admin: DemoUser = { email: "admin@demo.safesight.in", fullName: "Arjun Mehta", role: "admin" };

const studentNames = [
  "Riya Sharma", "Aarav Patel", "Sneha Iyer", "Kabir Singh", "Ananya Reddy",
  "Rohan Gupta", "Priya Nair", "Vikram Rao", "Ishita Banerjee", "Aditya Kulkarni",
  "Meera Pillai", "Siddharth Joshi", "Kavya Menon", "Rahul Verma", "Pooja Desai",
  "Nikhil Chauhan", "Tanvi Shah", "Harsh Agarwal", "Divya Krishnan", "Yash Malhotra",
  "Neha Bhatt", "Karan Kapoor", "Shruti Mishra", "Varun Saxena", "Aditi Ghosh",
  "Manish Yadav", "Lakshmi Subramanian", "Arnav Thakur", "Simran Kaur", "Dev Choudhary",
];

function studentEmail(name: string) {
  // Riya keeps the S1 demo login.
  if (name === "Riya Sharma") return "riya@demo.safesight.in";
  return `${name.toLowerCase().replace(/\s+/g, ".")}@demo.safesight.in`;
}

const students: DemoUser[] = studentNames.map((fullName) => ({
  email: studentEmail(fullName),
  fullName,
  role: "student",
}));

const courses = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Thermodynamics",
    code: "ME201",
    join_code: "THRM01",
    // Everyone takes Thermodynamics.
    students: students.length,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "Fluid Mechanics",
    code: "ME204",
    join_code: "FLMC02",
    // The first 20 students take Fluid Mechanics too.
    students: 20,
  },
] as const;

const day = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * day).toISOString();

const assignments = [
  {
    id: "00000000-0000-4000-8000-000000000201",
    course_id: courses[0].id,
    title: "Thermodynamics problem set 3",
    instructions:
      "Solve problems 1–6 on the first law for closed systems. Show each step, state your sign convention for work, and give units in every line.",
    ai_mode: "learn",
    teacher_notes:
      "Students often mix up work done by and on the system. Push them to draw the system boundary first.",
    due_at: inDays(5),
  },
  {
    id: "00000000-0000-4000-8000-000000000202",
    course_id: courses[0].id,
    title: "Essay: entropy in everyday life",
    instructions:
      "In 600–800 words, explain entropy with two examples from daily life. Write it in Trace.",
    ai_mode: "assist",
    teacher_notes: "Sage may explain entropy fully, but the essay must be the student's own writing.",
    due_at: inDays(12),
  },
  {
    id: "00000000-0000-4000-8000-000000000203",
    course_id: courses[0].id,
    title: "Mid-semester test",
    instructions: "Closed-book test in class. Sage is switched off for this one.",
    ai_mode: "exam",
    teacher_notes: "",
    due_at: inDays(19),
  },
  {
    id: "00000000-0000-4000-8000-000000000204",
    course_id: courses[1].id,
    title: "Bernoulli's equation worksheet",
    instructions:
      "Work through the five pipe-flow problems. State your assumptions before applying Bernoulli's equation.",
    ai_mode: "learn",
    teacher_notes: "Check that students state steady, incompressible, frictionless flow before using it.",
    due_at: inDays(7),
  },
  {
    id: "00000000-0000-4000-8000-000000000205",
    course_id: courses[1].id,
    title: "Lab report: flow through a venturi meter",
    instructions: "Write up the venturi meter lab: aim, method, readings, discharge coefficient and sources of error.",
    ai_mode: "assist",
    teacher_notes: "",
    due_at: inDays(14),
  },
] as const;

// ------------------------------------------------------------------ users

async function listAllUsers() {
  const byEmail = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) return byEmail;
  }
}

const existing = await listAllUsers();
let created = 0;

async function ensureUser(user: DemoUser): Promise<string> {
  let id = existing.get(user.email);
  if (id) {
    if (resetPasswords) {
      const { error } = await supabase.auth.admin.updateUserById(id, { password: seedPassword });
      if (error) throw error;
    }
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: seedPassword ?? randomBytes(24).toString("base64url"),
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });
    if (error) throw error;
    id = data.user.id;
    created++;
  }
  // Role and institution are set with the service role: the sign-up trigger
  // never grants teacher-by-default or admin.
  const { error } = await supabase.from("profiles").upsert({
    id,
    role: user.role,
    full_name: user.fullName,
    institution_id: institution.id,
  });
  if (error) throw error;
  return id;
}

async function upsert(table: string, rows: object | object[], onConflict?: string) {
  const { error } = await supabase.from(table).upsert(rows, onConflict ? { onConflict } : undefined);
  if (error) throw new Error(`${table}: ${error.message}`);
}

// ------------------------------------------------------------------ run

await upsert("institutions", institution);

const teacherId = await ensureUser(teacher);
await ensureUser(admin);
const studentIds: string[] = [];
for (const s of students) studentIds.push(await ensureUser(s));

await upsert(
  "courses",
  courses.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    join_code: c.join_code,
    teacher_id: teacherId,
    institution_id: institution.id,
  })),
);

await upsert(
  "enrollments",
  courses.flatMap((c) =>
    studentIds.slice(0, c.students).map((student_id) => ({ course_id: c.id, student_id })),
  ),
  "course_id,student_id",
);

await upsert(
  "assignments",
  assignments.map(({ id, course_id, title, instructions, ai_mode, due_at }) => ({
    id,
    course_id,
    title,
    instructions,
    ai_mode,
    due_at,
  })),
);
// Teacher notes are teacher-only (S4): they live in their own table.
await upsert(
  "assignment_teacher_notes",
  assignments
    .filter((a) => a.teacher_notes)
    .map((a) => ({ assignment_id: a.id, notes: a.teacher_notes })),
  "assignment_id",
);

console.log(`Institution  ${institution.name}, ${institution.city}`);
console.log(`Teacher      ${teacher.fullName} <${teacher.email}>`);
console.log(`Admin        ${admin.fullName} <${admin.email}>`);
for (const c of courses) console.log(`Course       ${c.code} ${c.name} (join code ${c.join_code}, ${c.students} students)`);
console.log(`Assignments  ${assignments.length}`);
console.log(`Students     ${students.length}`);
console.log(`New users    ${created}`);
console.log(
  seedPassword
    ? `New users' password: ${process.env.SEED_PASSWORD ? "$SEED_PASSWORD" : seedPassword}`
    : "New users got random passwords; existing logins are unchanged.",
);
