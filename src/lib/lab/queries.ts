import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchPaged } from "@/lib/trace/paged";
import type { EventDetail } from "./describe";
import type { LabEventType } from "./schemas";

/**
 * Read-only lab queries for the teacher and student pages. Every function
 * takes the signed-in user's client, so row-level security decides what is
 * visible: a teacher sees their own courses' sessions, a student their seats.
 */
type Db = SupabaseClient<Database>;

export type LabSession = {
  id: string;
  courseId: string;
  course: string;
  title: string;
  room: string;
  code: string;
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  blocklist: string[];
  createdAt: string;
  seats: number;
};

export type LabSeat = {
  id: string;
  studentId: string | null;
  studentName: string | null;
  rollNumber: string;
  seatLabel: string;
  joinedAt: string;
  lastHeartbeatAt: string;
  stoppedAt: string | null;
};

export type LabEvent = {
  id: number;
  seat_id: string;
  type: LabEventType;
  detail: EventDetail;
  at: string;
};

export function courseLabel(c: { name: string; code: string } | null): string {
  if (!c) return "";
  return c.code ? `${c.code} · ${c.name}` : c.name;
}

type SessionRow = Database["public"]["Tables"]["lab_sessions"]["Row"] & {
  courses: { name: string; code: string } | null;
  lab_seats: { count: number }[];
};

function toSession(r: SessionRow): LabSession {
  return {
    id: r.id,
    courseId: r.course_id,
    course: courseLabel(r.courses),
    title: r.title,
    room: r.room,
    code: r.code,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    endedAt: r.ended_at,
    blocklist: r.blocklist,
    createdAt: r.created_at,
    seats: r.lab_seats[0]?.count ?? 0,
  };
}

const sessionSelect = "*, courses(name, code), lab_seats(count)";

/** The teacher's lab sessions, newest start first. */
export async function listLabSessions(db: Db, teacherId: string): Promise<LabSession[]> {
  const { data, error } = await db
    .from("lab_sessions")
    .select("*, courses!inner(name, code, teacher_id), lab_seats(count)")
    .eq("courses.teacher_id", teacherId)
    .order("starts_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as SessionRow[]).map(toSession);
}

/** One session, or null if it isn't visible to this user. */
export async function getLabSession(db: Db, sessionId: string): Promise<LabSession | null> {
  const { data, error } = await db.from("lab_sessions").select(sessionSelect).eq("id", sessionId).maybeSingle();
  if (error) throw error;
  return data ? toSession(data as unknown as SessionRow) : null;
}

export async function listSeats(db: Db, sessionId: string): Promise<LabSeat[]> {
  const rows = await fetchPaged((from, to) =>
    db
      .from("lab_seats")
      .select("id, student_id, roll_number, seat_label, joined_at, last_heartbeat_at, stopped_at, profiles(full_name)")
      .eq("session_id", sessionId)
      .order("joined_at")
      .range(from, to),
  );
  return rows.map((r) => ({
    id: r.id,
    studentId: r.student_id,
    studentName: r.profiles?.full_name || null,
    rollNumber: r.roll_number,
    seatLabel: r.seat_label,
    joinedAt: r.joined_at,
    lastHeartbeatAt: r.last_heartbeat_at,
    stoppedAt: r.stopped_at,
  }));
}

export async function listEvents(db: Db, sessionId: string): Promise<LabEvent[]> {
  const rows = await fetchPaged((from, to) =>
    db
      .from("lab_events")
      .select("id, seat_id, type, detail, at")
      .eq("session_id", sessionId)
      .order("at")
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({ ...r, detail: (r.detail ?? {}) as EventDetail }));
}

export type LabReportRow = {
  seatId: string;
  summary: string;
  metrics: unknown;
  createdAt: string;
};

export async function listReports(db: Db, sessionId: string): Promise<LabReportRow[]> {
  const { data, error } = await db
    .from("lab_reports")
    .select("seat_id, summary, metrics, created_at")
    .eq("session_id", sessionId)
    .limit(1000);
  if (error) throw error;
  return data.map((r) => ({ seatId: r.seat_id, summary: r.summary, metrics: r.metrics, createdAt: r.created_at }));
}

export type StudentLabReport = {
  seatId: string;
  title: string;
  course: string;
  startsAt: string;
  rollNumber: string;
  seatLabel: string;
  summary: string | null;
};

/** A student's own lab seats with their summaries (RLS: own rows only). */
export async function listMyLabSeats(db: Db, studentId: string): Promise<StudentLabReport[]> {
  const { data, error } = await db
    .from("lab_seats")
    .select("id, roll_number, seat_label, lab_sessions(title, starts_at, courses(name, code)), lab_reports(summary)")
    .eq("student_id", studentId)
    .order("joined_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.map((r) => {
    const s = r.lab_sessions as unknown as { title: string; starts_at: string; courses: { name: string; code: string } | null } | null;
    const report = r.lab_reports as unknown as { summary: string } | { summary: string }[] | null;
    const summary = Array.isArray(report) ? (report[0]?.summary ?? null) : (report?.summary ?? null);
    return {
      seatId: r.id,
      title: s?.title ?? "Lab session",
      course: courseLabel(s?.courses ?? null),
      startsAt: s?.starts_at ?? "",
      rollNumber: r.roll_number,
      seatLabel: r.seat_label,
      summary,
    };
  });
}
