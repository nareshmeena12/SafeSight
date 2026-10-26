import { z } from "zod";
import { normaliseRoll, type ParsedRoster, type RosterIssue, type RosterRow } from "@/lib/setup/roster";

/**
 * Pure helpers for LMS imports (S25): turn Google Classroom and Moodle API
 * replies into the same class list the CSV import uses (lib/setup/roster.ts),
 * so every import goes through `importRosterRows` and its invite rules.
 */

const emailSchema = z.email();
const ROLL = /^[A-Z0-9/-]{1,32}$/;

function toRoster(people: { name: string; email: string | null | undefined; roll?: string | null }[], label: (i: number) => number): ParsedRoster {
  const rows: RosterRow[] = [];
  const warnings: RosterIssue[] = [];
  const seen = new Set<string>();
  people.forEach((p, i) => {
    const line = label(i);
    const email = (p.email ?? "").trim().toLowerCase();
    if (!email || !emailSchema.safeParse(email).success) {
      warnings.push({ line, message: `${p.name || "A student"} has no email address we can see, so they weren't added.` });
      return;
    }
    if (seen.has(email)) return;
    seen.add(email);
    const roll = p.roll ? normaliseRoll(p.roll) : "";
    rows.push({ line, name: p.name.trim().slice(0, 120), email, rollNumber: roll && ROLL.test(roll) ? roll : null });
  });
  return { rows, errors: [], warnings };
}

// ---------------------------------------------------------------- Google Classroom

export const classroomCourseSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  section: z.string().optional(),
  descriptionHeading: z.string().optional(),
  courseState: z.string().optional(),
  alternateLink: z.string().optional(),
});
export type ClassroomCourse = z.infer<typeof classroomCourseSchema>;

export const classroomCoursesPage = z.object({
  courses: z.array(classroomCourseSchema).default([]),
  nextPageToken: z.string().optional(),
});

export const classroomStudentSchema = z.object({
  userId: z.string(),
  profile: z
    .object({
      name: z.object({ fullName: z.string().optional() }).partial().optional(),
      emailAddress: z.string().optional(),
    })
    .optional(),
});
export type ClassroomStudent = z.infer<typeof classroomStudentSchema>;

export const classroomStudentsPage = z.object({
  students: z.array(classroomStudentSchema).default([]),
  nextPageToken: z.string().optional(),
});

/** Classroom students → class list. Classroom has no roll numbers. */
export function classroomRoster(students: ClassroomStudent[]): ParsedRoster {
  return toRoster(
    students.map((s) => ({ name: s.profile?.name?.fullName ?? "", email: s.profile?.emailAddress })),
    (i) => i + 1,
  );
}

/** "Thermodynamics · Section A" */
export function classroomCourseLabel(c: Pick<ClassroomCourse, "name" | "section">): string {
  return [c.name.trim(), c.section?.trim()].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------- Moodle

/**
 * Moodle's REST server reads PHP-style form fields: arrays and objects are
 * flattened to `values[0]=…`, `options[0][name]=…`.
 */
export function moodleParams(fn: string, params: Record<string, unknown>, token: string): URLSearchParams {
  const out = new URLSearchParams({ wstoken: token, wsfunction: fn, moodlewsrestformat: "json" });
  const add = (prefix: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => add(`${prefix}[${i}]`, v));
    else if (typeof value === "object") Object.entries(value).forEach(([k, v]) => add(`${prefix}[${k}]`, v));
    else out.append(prefix, String(value));
  };
  Object.entries(params).forEach(([k, v]) => add(k, v));
  return out;
}

export const moodleErrorSchema = z.object({ exception: z.string(), errorcode: z.string().optional(), message: z.string().optional() });

export const moodleCourseSchema = z.object({
  id: z.number(),
  fullname: z.string().default(""),
  shortname: z.string().default(""),
  visible: z.number().optional(),
});
export type MoodleCourse = z.infer<typeof moodleCourseSchema>;

export const moodleUserSchema = z.object({
  id: z.number(),
  fullname: z.string().default(""),
  email: z.string().optional(),
  idnumber: z.string().optional(),
  roles: z.array(z.object({ shortname: z.string() })).default([]),
});
export type MoodleUser = z.infer<typeof moodleUserSchema>;

/** Course roles that may import a Moodle course's class list. */
export const MOODLE_TEACHING_ROLES = ["editingteacher", "teacher", "manager"];

export function moodleTeaches(users: MoodleUser[], moodleUserId: number): boolean {
  const me = users.find((u) => u.id === moodleUserId);
  return Boolean(me?.roles.some((r) => MOODLE_TEACHING_ROLES.includes(r.shortname)));
}

/** Enrolled users → class list: students only; Moodle's "ID number" is the roll number. */
export function moodleRoster(users: MoodleUser[]): ParsedRoster {
  const students = users.filter((u) => u.roles.some((r) => r.shortname === "student"));
  return toRoster(
    students.map((u) => ({ name: u.fullname, email: u.email, roll: u.idnumber })),
    (i) => i + 1,
  );
}
