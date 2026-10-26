import "server-only";
import { requireRole, type CurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { Db } from "@/lib/teacher/queries";
import { policyFromRow, type AiPolicy, type CoursePolicy } from "./policy";
import type { DepartmentWeekRow, UsageRow } from "./stats";

/**
 * Read layer for the admin area (S23). Everything goes through the admin's
 * own client: RLS lets them read their institution's departments, policies,
 * invites, staff and courses; anything about students comes from the
 * SECURITY DEFINER `admin_*` functions, which return aggregates only.
 */

export type Institution = { id: string; name: string; city: string };

export type AdminContext = { user: CurrentUser; db: Db; institution: Institution | null };

/** Use at the top of every admin page and action. */
export async function adminContext(): Promise<AdminContext> {
  const user = await requireRole(["admin"]);
  const db = await createClient();
  const { data } = await db
    .from("profiles")
    .select("institution:institutions(id, name, city)")
    .eq("id", user.id)
    .maybeSingle();
  const institution = Array.isArray(data?.institution) ? data.institution[0] : data?.institution;
  return { user, db, institution: institution ?? null };
}

export type Department = { id: string; name: string; code: string };

export async function listDepartments(db: Db, institutionId: string): Promise<Department[]> {
  const { data } = await db
    .from("departments")
    .select("id, name, code")
    .eq("institution_id", institutionId)
    .order("name");
  return data ?? [];
}

export type PolicyMap = { college: AiPolicy | null; departments: Map<string, AiPolicy> };

export async function listPolicies(db: Db, institutionId: string): Promise<PolicyMap> {
  const { data } = await db
    .from("ai_policies")
    .select("department_id, allowed_modes, default_mode, max_hint_level, worked_examples, lab_mode_allowed, teachers_can_loosen")
    .eq("institution_id", institutionId);
  const map: PolicyMap = { college: null, departments: new Map() };
  for (const row of data ?? []) {
    if (row.department_id) map.departments.set(row.department_id, policyFromRow(row));
    else map.college = policyFromRow(row);
  }
  return map;
}

/** The policy a department's courses follow: its own, else the college default. */
export function effectivePolicy(map: PolicyMap, departmentId: string | null) {
  const own = departmentId ? map.departments.get(departmentId) : undefined;
  if (own) return { policy: own, source: "department" as const };
  if (map.college) return { policy: map.college, source: "college" as const };
  return { policy: null, source: "none" as const };
}

export type StaffMember = {
  id: string;
  fullName: string;
  email: string;
  role: "teacher" | "admin";
  departmentId: string | null;
  courses: number;
  lastActiveAt: string | null;
};

export async function listStaff(db: Db): Promise<StaffMember[]> {
  const { data } = await db.rpc("admin_staff");
  return (data ?? [])
    .filter((s) => s.role !== "student")
    .map((s) => ({
      id: s.id,
      fullName: s.full_name,
      email: s.email,
      role: s.role as "teacher" | "admin",
      departmentId: s.department_id,
      courses: s.courses,
      lastActiveAt: s.last_active_at,
    }));
}

export type AdminCourse = {
  id: string;
  name: string;
  code: string;
  departmentId: string | null;
  teacherName: string;
  students: number;
  activeStudents7d: number;
  assignments: number;
  avgReliance: number | null;
  openFlags: number;
  outsidePolicy: number;
};

export async function listCourses(db: Db): Promise<AdminCourse[]> {
  const { data } = await db.rpc("admin_courses");
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    departmentId: c.department_id,
    teacherName: c.teacher_name,
    students: c.students,
    activeStudents7d: c.active_students_7d,
    assignments: c.assignments,
    avgReliance: c.avg_reliance === null ? null : Math.round(c.avg_reliance),
    openFlags: c.open_flags,
    outsidePolicy: c.outside_policy,
  }));
}

export type AdoptionWeek = {
  week: string;
  activeStudents: number;
  activeTeachers: number;
  sageMessages: number;
  enrolledStudents: number;
};

export async function adoption(db: Db, weeks: number): Promise<AdoptionWeek[]> {
  const { data } = await db.rpc("admin_adoption", { p_weeks: weeks });
  return (data ?? []).map((r) => ({
    week: r.week,
    activeStudents: r.active_students,
    activeTeachers: r.active_teachers,
    sageMessages: r.sage_messages,
    enrolledStudents: r.enrolled_students,
  }));
}

export async function departmentWeekly(db: Db, weeks: number): Promise<DepartmentWeekRow[]> {
  const { data } = await db.rpc("admin_department_weekly", { p_weeks: weeks });
  return data ?? [];
}

export async function aiUsage(db: Db, weeks: number): Promise<UsageRow[]> {
  const { data } = await db.rpc("admin_ai_usage", { p_weeks: weeks });
  return data ?? [];
}

export type TeacherInvite = {
  id: string;
  email: string;
  fullName: string;
  departmentId: string | null;
  status: "pending" | "joined";
  emailStatus: "queued" | "sent" | "failed" | "not_configured";
  createdAt: string;
};

export async function listTeacherInvites(db: Db, institutionId: string): Promise<TeacherInvite[]> {
  const { data } = await db
    .from("teacher_invites")
    .select("id, email, full_name, department_id, status, email_status, created_at")
    .eq("institution_id", institutionId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    fullName: i.full_name,
    departmentId: i.department_id,
    status: i.status as TeacherInvite["status"],
    emailStatus: i.email_status as TeacherInvite["emailStatus"],
    createdAt: i.created_at,
  }));
}

/**
 * For teachers: the AI policy that applies to one of their courses (null when
 * the admin hasn't set one). Read with the teacher's client; the function
 * checks they teach the course.
 */
export async function coursePolicy(db: Db, courseId: string): Promise<CoursePolicy | null> {
  const { data, error } = await db.rpc("course_ai_policy", { p_course_id: courseId });
  const row = data?.[0];
  if (error || !row) return null;
  return {
    ...policyFromRow(row),
    scope: row.scope === "department" ? "department" : "college",
    departmentName: row.department_name,
  };
}
