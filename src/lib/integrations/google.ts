import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { fetchJson, LmsError } from "./http";
import {
  classroomCoursesPage,
  classroomCourseSchema,
  classroomStudentsPage,
  type ClassroomCourse,
  type ClassroomStudent,
} from "./lms";
import { seal, unseal } from "./seal";

/**
 * Google Classroom import (S25), behind GOOGLE_CLASSROOM_ENABLED. Uses the
 * same Google OAuth client as "Continue with Google" (GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET) with read-only Classroom scopes. The access token is
 * short-lived (about an hour), never stored: it lives in an encrypted,
 * httpOnly cookie bound to the SafeSight user, and no refresh token is asked
 * for. Only courses the teacher teaches are listed or imported.
 */

export const CLASSROOM_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.profile.emails",
];

const TOKEN_COOKIE = "ss_classroom";
const STATE_COOKIE = "ss_classroom_state";
const API = "https://classroom.googleapis.com/v1";
const MAX_STUDENTS = 1000;

export type ClassroomConfig = { clientId: string; clientSecret: string };

/** null = not configured yet (the page explains what's missing). */
export function classroomConfig(): ClassroomConfig | null {
  if (process.env.GOOGLE_CLASSROOM_ENABLED?.trim().toLowerCase() !== "true") return null;
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function classroomRedirectUri(origin: string) {
  return `${origin}/api/integrations/google/callback`;
}

type StateCookie = { state: string; uid: string };
type TokenCookie = { uid: string; token: string; exp: number };

const cookieOptions = (secure: boolean, maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge });

/** Starts the consent screen: a fresh state, kept in a sealed cookie for 10 minutes. */
export async function classroomAuthUrl(cfg: ClassroomConfig, opts: { origin: string; userId: string; email: string }) {
  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, seal({ state, uid: opts.userId } satisfies StateCookie, cfg.clientSecret), cookieOptions(opts.origin.startsWith("https:"), 600));
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: classroomRedirectUri(opts.origin),
    response_type: "code",
    scope: CLASSROOM_SCOPES.join(" "),
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  if (opts.email) q.set("login_hint", opts.email);
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Checks the state, swaps the code for an access token and keeps it in the token cookie. */
export async function finishClassroomAuth(cfg: ClassroomConfig, opts: { origin: string; userId: string; code: string; state: string }) {
  const jar = await cookies();
  const saved = unseal<StateCookie>(jar.get(STATE_COOKIE)?.value, cfg.clientSecret);
  jar.delete(STATE_COOKIE);
  if (!saved || saved.state !== opts.state || saved.uid !== opts.userId) throw new LmsError("That sign-in link expired. Please connect again.", 400);

  const body = (await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: classroomRedirectUri(opts.origin),
      grant_type: "authorization_code",
    }),
  })) as { access_token?: string; expires_in?: number; scope?: string };
  if (!body.access_token) throw new LmsError("Google didn't send an access token.", 502);
  const granted = (body.scope ?? "").split(" ");
  if (!CLASSROOM_SCOPES.slice(0, 2).every((s) => granted.includes(s))) {
    throw new LmsError("Please tick the Classroom permissions on Google's screen so we can read your class lists.", 403);
  }
  const ttl = Math.max(60, Math.min(3600, (body.expires_in ?? 3600) - 60));
  jar.set(
    TOKEN_COOKIE,
    seal({ uid: opts.userId, token: body.access_token, exp: Date.now() + ttl * 1000 } satisfies TokenCookie, cfg.clientSecret),
    cookieOptions(opts.origin.startsWith("https:"), ttl),
  );
}

/** The teacher's Classroom access token, or null when not connected (or it expired). */
export async function classroomToken(cfg: ClassroomConfig, userId: string): Promise<string | null> {
  const value = unseal<TokenCookie>((await cookies()).get(TOKEN_COOKIE)?.value, cfg.clientSecret);
  return value && value.uid === userId && value.exp > Date.now() ? value.token : null;
}

export async function disconnectClassroom() {
  (await cookies()).delete(TOKEN_COOKIE);
}

const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

/** Active courses the teacher teaches. */
export async function listClassroomCourses(token: string): Promise<ClassroomCourse[]> {
  const out: ClassroomCourse[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ teacherId: "me", courseStates: "ACTIVE", pageSize: "100" });
    if (pageToken) q.set("pageToken", pageToken);
    const page = classroomCoursesPage.parse(await fetchJson(`${API}/courses?${q}`, auth(token)));
    out.push(...page.courses);
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < 500);
  return out;
}

/** The course, only if the signed-in Google user is one of its teachers. */
export async function classroomCourseIfTeacher(token: string, courseId: string): Promise<ClassroomCourse | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(courseId)) return null;
  try {
    await fetchJson(`${API}/courses/${courseId}/teachers/me`, auth(token));
    return classroomCourseSchema.parse(await fetchJson(`${API}/courses/${courseId}`, auth(token)));
  } catch (e) {
    if (e instanceof LmsError && (e.status === 403 || e.status === 404)) return null;
    throw e;
  }
}

export async function listClassroomStudents(token: string, courseId: string): Promise<ClassroomStudent[]> {
  const out: ClassroomStudent[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: "100" });
    if (pageToken) q.set("pageToken", pageToken);
    const page = classroomStudentsPage.parse(await fetchJson(`${API}/courses/${courseId}/students?${q}`, auth(token)));
    out.push(...page.students);
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < MAX_STUDENTS);
  return out.slice(0, MAX_STUDENTS);
}
