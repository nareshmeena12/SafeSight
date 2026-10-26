import "server-only";
import type { CurrentUser } from "@/lib/auth/dal";
import { importRosterRows, type ImportSummary } from "@/lib/setup/invites";
import type { ParsedRoster } from "@/lib/setup/roster";
import { teacherCourse } from "@/lib/setup/server";
import type { Db } from "@/lib/teacher/queries";

export type LmsProvider = "google_classroom" | "moodle";

export const providerLabels: Record<LmsProvider, string> = { google_classroom: "Google Classroom", moodle: "Moodle" };

/** "new" makes a SafeSight course; otherwise the id of one the teacher teaches. */
export type ImportTarget = { kind: "new"; name: string; code: string } | { kind: "existing"; courseId: string };

export type ExternalImportResult = { courseId: string; created: boolean; summary: ImportSummary } | { error: string };

/**
 * One LMS course → one SafeSight course (S25): makes the course (under RLS, as
 * the teacher) or checks the teacher owns the chosen one, remembers the link,
 * then runs the S22 class-list import (existing student accounts join at once,
 * everyone else is invited and joins when they sign in with that email).
 */
export async function importExternalCourse(
  db: Db,
  user: CurrentUser,
  /** null for a CSV file (nothing to link back to). */
  source: { provider: LmsProvider; externalId: string; externalName: string } | null,
  target: ImportTarget,
  roster: ParsedRoster,
): Promise<ExternalImportResult> {
  if (!roster.rows.length) {
    return { error: "We didn't find any students with an email address in that class. Nothing was imported." };
  }

  let courseId: string;
  let created = false;
  if (target.kind === "existing") {
    const course = await teacherCourse(db, user.id, target.courseId);
    if (!course) return { error: "Only this course's teacher can import into it." };
    courseId = course.id;
  } else {
    const { data, error } = await db
      .from("courses")
      .insert({ teacher_id: user.id, name: target.name, code: target.code })
      .select("id")
      .single();
    if (error) {
      console.error("import: create course:", error.message);
      return { error: "We couldn't make the course just now. Please try again." };
    }
    courseId = data.id;
    created = true;
  }

  const result = await importRosterRows({ id: courseId }, user.id, roster);
  if ("error" in result) return result;

  if (!source) return { courseId, created, summary: result };
  const link = await db.from("course_external_links").upsert(
    {
      course_id: courseId,
      provider: source.provider,
      external_id: source.externalId,
      external_name: source.externalName.slice(0, 300),
      last_imported_at: new Date().toISOString(),
      created_by: user.id,
    },
    { onConflict: "course_id,provider,external_id" },
  );
  if (link.error) console.warn("import: link:", link.error.message);
  return { courseId, created, summary: result };
}

export type ExternalLink = { courseId: string; courseName: string; externalId: string; lastImportedAt: string };

/** The teacher's courses imported from this LMS, keyed by the LMS course id (RLS: course teacher). */
export async function linkedCourses(db: Db, provider: LmsProvider): Promise<Map<string, ExternalLink>> {
  const { data, error } = await db
    .from("course_external_links")
    .select("course_id, external_id, last_imported_at, course:courses(name)")
    .eq("provider", provider)
    .order("last_imported_at", { ascending: false });
  if (error) throw new Error(error.message);
  const out = new Map<string, ExternalLink>();
  for (const l of data) {
    if (out.has(l.external_id)) continue;
    const course = Array.isArray(l.course) ? l.course[0] : l.course;
    out.set(l.external_id, { courseId: l.course_id, courseName: course?.name ?? "", externalId: l.external_id, lastImportedAt: l.last_imported_at });
  }
  return out;
}
