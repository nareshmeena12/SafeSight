import "server-only";
import { fetchJson, LmsError } from "./http";
import { moodleCourseSchema, moodleErrorSchema, moodleParams, moodleTeaches, moodleUserSchema, type MoodleCourse, type MoodleUser } from "./lms";

/**
 * Moodle web service import (S25), when MOODLE_URL and MOODLE_TOKEN are set.
 * The token belongs to the college's Moodle (a web service user with the
 * functions listed in the PR), so it could read every course: SafeSight only
 * lists and imports courses where the teacher's own email has a teaching role.
 * Without the env, Moodle's CSV export works through the class-list import.
 */

export type MoodleConfig = { url: string; token: string };

export function moodleConfig(): MoodleConfig | null {
  const url = process.env.MOODLE_URL?.trim().replace(/\/+$/, "");
  const token = process.env.MOODLE_TOKEN?.trim();
  if (!url || !token || !/^https?:\/\//.test(url)) return null;
  return { url, token };
}

async function call(cfg: MoodleConfig, fn: string, params: Record<string, unknown>): Promise<unknown> {
  const body = await fetchJson(`${cfg.url}/webservice/rest/server.php`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: moodleParams(fn, params, cfg.token),
  });
  // Moodle answers errors with 200 and an exception object.
  const err = moodleErrorSchema.safeParse(body);
  if (err.success) {
    const denied = /accessexception|invalidtoken|nopermission|webservicesnotenabled/i.test(`${err.data.errorcode} ${err.data.exception}`);
    throw new LmsError(err.data.message ?? err.data.errorcode ?? "Moodle refused the request.", denied ? 403 : 502);
  }
  return body;
}

/** The Moodle account with this email, or null. */
export async function moodleUserByEmail(cfg: MoodleConfig, email: string): Promise<{ id: number } | null> {
  const users = moodleUserSchema.array().parse(await call(cfg, "core_user_get_users_by_field", { field: "email", values: [email] }));
  return users[0] ? { id: users[0].id } : null;
}

/** Courses the teacher's Moodle account is enrolled in (teaching role checked on import). */
export async function moodleCoursesFor(cfg: MoodleConfig, email: string): Promise<{ moodleUserId: number | null; courses: MoodleCourse[] }> {
  const user = await moodleUserByEmail(cfg, email);
  if (!user) return { moodleUserId: null, courses: [] };
  const courses = moodleCourseSchema.array().parse(await call(cfg, "core_enrol_get_users_courses", { userid: user.id }));
  return { moodleUserId: user.id, courses: courses.filter((c) => c.id !== 1) };
}

/** A course's enrolled users, only if `email` teaches it there. */
export async function moodleCourseForTeacher(
  cfg: MoodleConfig,
  email: string,
  courseId: number,
): Promise<{ course: MoodleCourse; users: MoodleUser[] } | null> {
  const { moodleUserId, courses } = await moodleCoursesFor(cfg, email);
  const course = courses.find((c) => c.id === courseId);
  if (!moodleUserId || !course) return null;
  const users = moodleUserSchema.array().parse(await call(cfg, "core_enrol_get_enrolled_users", { courseid: courseId }));
  return moodleTeaches(users, moodleUserId) ? { course, users } : null;
}
