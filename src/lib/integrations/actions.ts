"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/dal";
import type { ImportSummary } from "@/lib/setup/invites";
import { parseRoster } from "@/lib/setup/roster";
import { createClient } from "@/lib/supabase/server";
import { classroomConfig, classroomCourseIfTeacher, classroomToken, disconnectClassroom, listClassroomStudents } from "./google";
import { LmsError } from "./http";
import { importExternalCourse, type ImportTarget } from "./import";
import { classroomCourseLabel, classroomRoster, moodleRoster } from "./lms";
import { moodleConfig, moodleCourseForTeacher } from "./moodle";

/**
 * LMS import server actions (S25). Each checks the role, validates with zod,
 * re-reads the LMS on the server (nothing about the class list is trusted
 * from the browser) and checks the teacher teaches the LMS course before
 * anything is written.
 */

export type LmsImportState = {
  status: "idle" | "error" | "success";
  message?: string;
  courseId?: string;
  created?: boolean;
  summary?: ImportSummary;
};

const targetSchema = z
  .object({
    target: z.union([z.literal("new"), z.uuid()]),
    name: z.string().trim().max(200).optional(),
    code: z.string().trim().max(32, "Keep the course code under 32 characters.").optional(),
  })
  .transform((v, ctx): ImportTarget => {
    if (v.target !== "new") return { kind: "existing", courseId: v.target };
    if (!v.name || v.name.length < 2) {
      ctx.addIssue({ code: "custom", message: "Give the new course a name." });
      return z.NEVER;
    }
    return { kind: "new", name: v.name, code: v.code ?? "" };
  });

function fields(formData: FormData) {
  const raw = Object.fromEntries(formData);
  return { ...raw, name: raw.name ?? undefined, code: raw.code ?? undefined };
}

function lmsMessage(e: unknown, service: string): string {
  if (e instanceof LmsError) {
    if (e.status === 401) return `Your ${service} connection has expired. Please connect again.`;
    if (e.status === 403) return `${service} didn't let SafeSight read that class. ${e.message}`;
    return `${service} didn't answer properly just now (${e.message}). Please try again.`;
  }
  console.error(`${service} import:`, e);
  return "We couldn't import the class just now. Please try again.";
}

function done(result: Awaited<ReturnType<typeof importExternalCourse>>): LmsImportState {
  if ("error" in result) return { status: "error", message: result.error };
  refresh();
  return { status: "success", courseId: result.courseId, created: result.created, summary: result.summary };
}

const classroomSchema = z.object({ externalId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

export async function importFromClassroom(_prev: LmsImportState, formData: FormData): Promise<LmsImportState> {
  const user = await requireRole(["teacher", "admin"]);
  const cfg = classroomConfig();
  if (!cfg) return { status: "error", message: "Google Classroom import isn't set up yet." };
  const source = classroomSchema.safeParse(Object.fromEntries(formData));
  const target = targetSchema.safeParse(fields(formData));
  if (!source.success) return { status: "error", message: "Choose a Classroom class first." };
  if (!target.success) return { status: "error", message: target.error.issues[0]?.message };
  const token = await classroomToken(cfg, user.id);
  if (!token) return { status: "error", message: "Your Google Classroom connection has expired. Please connect again." };
  try {
    const course = await classroomCourseIfTeacher(token, source.data.externalId);
    if (!course) return { status: "error", message: "Only a teacher of that Classroom class can import it." };
    const students = await listClassroomStudents(token, course.id);
    return done(
      await importExternalCourse(
        await createClient(),
        user,
        { provider: "google_classroom", externalId: course.id, externalName: classroomCourseLabel(course) },
        target.data,
        classroomRoster(students),
      ),
    );
  } catch (e) {
    return { status: "error", message: lmsMessage(e, "Google Classroom") };
  }
}

const moodleSchema = z.object({ externalId: z.coerce.number().int().positive() });

export async function importFromMoodle(_prev: LmsImportState, formData: FormData): Promise<LmsImportState> {
  const user = await requireRole(["teacher", "admin"]);
  const cfg = moodleConfig();
  if (!cfg) return { status: "error", message: "Moodle import isn't set up yet. You can still upload Moodle's CSV export." };
  const source = moodleSchema.safeParse(Object.fromEntries(formData));
  const target = targetSchema.safeParse(fields(formData));
  if (!source.success) return { status: "error", message: "Choose a Moodle course first." };
  if (!target.success) return { status: "error", message: target.error.issues[0]?.message };
  try {
    const found = await moodleCourseForTeacher(cfg, user.email, source.data.externalId);
    if (!found) return { status: "error", message: "Only a teacher of that Moodle course can import it." };
    return done(
      await importExternalCourse(
        await createClient(),
        user,
        { provider: "moodle", externalId: String(found.course.id), externalName: found.course.fullname },
        target.data,
        moodleRoster(found.users),
      ),
    );
  } catch (e) {
    return { status: "error", message: lmsMessage(e, "Moodle") };
  }
}

const csvSchema = z.object({
  csv: z.string().trim().min(3, "Choose Moodle's CSV export first.").max(400_000, "That file is too long. Import it in parts."),
});

/** Moodle's participants export (or any class-list CSV) into a new or existing course. */
export async function importMoodleCsv(_prev: LmsImportState, formData: FormData): Promise<LmsImportState> {
  const user = await requireRole(["teacher", "admin"]);
  const parsed = csvSchema.safeParse(Object.fromEntries(formData));
  const target = targetSchema.safeParse(fields(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  if (!target.success) return { status: "error", message: target.error.issues[0]?.message };
  const roster = parseRoster(parsed.data.csv);
  if (!roster.rows.length) {
    return { status: "error", message: roster.errors[0]?.message ?? "We couldn't find any students with an email address in that file." };
  }
  try {
    return done(await importExternalCourse(await createClient(), user, null, target.data, roster));
  } catch (e) {
    console.error("moodle csv import:", e);
    return { status: "error", message: "We couldn't import the list just now. Please try again." };
  }
}

export async function disconnectClassroomAction(): Promise<void> {
  await requireRole(["teacher", "admin"]);
  await disconnectClassroom();
  refresh();
}
