import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { LATE_EVENTS_MS, SILENT_AFTER_MS, HEARTBEAT_MS, IDLE_AFTER_SECONDS } from "./constants";
import { fullBlocklist } from "./domains";
import type { ClientEvent } from "./schemas";
import { canJoin, clampTime, effectiveEnd } from "./status";
import { hashSeatToken, newSeatToken } from "./tokens";

/**
 * The extension's side of Live Lab Mode (S13). The extension has no Supabase
 * login: it proves itself with a per-seat token, and these functions write
 * with the service role after checking it. Only facts about activity are
 * stored (event type, host name, character counts, seconds), never page or
 * clipboard text.
 */

type Admin = ReturnType<typeof createAdminClient>;

type SessionRow = {
  id: string;
  course_id: string;
  title: string;
  room: string;
  starts_at: string;
  ends_at: string;
  ended_at: string | null;
  blocklist: string[];
  courses: { name: string; code: string } | null;
};

/** What the extension needs to run a session. */
export type SessionConfig = {
  active: boolean;
  title: string;
  course: string;
  room: string;
  startsAt: string;
  endsAt: string;
  blocklist: string[];
  heartbeatMs: number;
  idleAfterSeconds: number;
};

function config(s: SessionRow, active: boolean): SessionConfig {
  const course = s.courses ? [s.courses.code, s.courses.name].filter(Boolean).join(" · ") : "";
  return {
    active,
    title: s.title,
    course,
    room: s.room,
    startsAt: s.starts_at,
    endsAt: new Date(effectiveEnd(s)).toISOString(),
    blocklist: fullBlocklist(s.blocklist),
    heartbeatMs: HEARTBEAT_MS,
    idleAfterSeconds: IDLE_AFTER_SECONDS,
  };
}

const sessionColumns = "id, course_id, title, room, starts_at, ends_at, ended_at, blocklist, courses(name, code)";

export type JoinResult =
  | { ok: true; token: string; seat: { id: string; label: string; rollNumber: string; matched: boolean }; session: SessionConfig }
  | { ok: false; reason: "unknown_code" | "too_early" | "ended"; message: string; status: number };

export async function joinSeat(input: {
  code: string;
  rollNumber: string;
  seatLabel?: string;
  now?: number;
}): Promise<JoinResult> {
  const db = createAdminClient();
  const now = input.now ?? Date.now();
  const { data: session, error } = await db
    .from("lab_sessions")
    .select(sessionColumns)
    .eq("code", input.code)
    .maybeSingle<SessionRow>();
  if (error) throw error;
  if (!session) {
    return {
      ok: false,
      reason: "unknown_code",
      status: 404,
      message: "That code doesn't match a lab session. Check the code on the board and try again.",
    };
  }
  const state = canJoin(session, now);
  if (state === "too_early") {
    const opens = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
      Date.parse(session.starts_at),
    );
    return { ok: false, reason: "too_early", status: 409, message: `This session starts at ${opens}. You can join 15 minutes before.` };
  }
  if (state === "ended") {
    return { ok: false, reason: "ended", status: 410, message: "This lab session has already ended." };
  }

  const studentId = await matchStudent(db, session.course_id, input.rollNumber);
  const label = input.seatLabel || input.rollNumber;
  const nowIso = new Date(now).toISOString();

  const { data: existing } = await db
    .from("lab_seats")
    .select("id")
    .eq("session_id", session.id)
    .eq("roll_number", input.rollNumber)
    .maybeSingle();

  let seatId: string;
  if (existing) {
    // Same roll number again (browser restart, another PC): the new token
    // replaces the old one, so only the latest extension keeps recording.
    seatId = existing.id;
    const { error: e } = await db
      .from("lab_seats")
      .update({ seat_label: label, student_id: studentId, last_heartbeat_at: nowIso, stopped_at: null })
      .eq("id", seatId);
    if (e) throw e;
  } else {
    const { data, error: e } = await db
      .from("lab_seats")
      .insert({
        session_id: session.id,
        roll_number: input.rollNumber,
        seat_label: label,
        student_id: studentId,
        joined_at: nowIso,
        last_heartbeat_at: nowIso,
      })
      .select("id")
      .single();
    if (e) throw e;
    seatId = data.id;
  }

  const token = newSeatToken();
  const { error: tokenError } = await db
    .from("lab_seat_tokens")
    .upsert({ seat_id: seatId, token_hash: hashSeatToken(token), created_at: nowIso });
  if (tokenError) throw tokenError;

  await insertEvents(db, session.id, seatId, [
    { type: existing ? "rejoined" : "joined", detail: {}, at: nowIso },
  ]);

  return {
    ok: true,
    token,
    seat: { id: seatId, label, rollNumber: input.rollNumber, matched: studentId !== null },
    session: config(session, true),
  };
}

/** The one enrolled student with this roll number, if exactly one. */
async function matchStudent(db: Admin, courseId: string, rollNumber: string): Promise<string | null> {
  const { data, error } = await db
    .from("profiles")
    .select("id, enrollments!inner(course_id)")
    .eq("roll_number", rollNumber)
    .eq("enrollments.course_id", courseId)
    .limit(2);
  if (error) throw error;
  return data.length === 1 ? data[0]!.id : null;
}

export type HeartbeatResult =
  | { ok: true; session: SessionConfig }
  | { ok: false; status: number; message: string };

/**
 * A heartbeat with the events recorded since the last one. Returns whether
 * the seat should keep recording; the extension stops itself when it is not.
 */
export async function heartbeat(input: {
  token: string;
  events: ClientEvent[];
  leave?: boolean;
  now?: number;
}): Promise<HeartbeatResult> {
  const db = createAdminClient();
  const now = input.now ?? Date.now();

  const { data: tokenRow, error: tokenError } = await db
    .from("lab_seat_tokens")
    .select("seat_id")
    .eq("token_hash", hashSeatToken(input.token))
    .maybeSingle();
  if (tokenError) throw tokenError;
  if (!tokenRow) {
    return {
      ok: false,
      status: 401,
      message: "This seat isn't recording any more. If you joined on another PC, that one is now in use.",
    };
  }

  const { data: seat, error: seatError } = await db
    .from("lab_seats")
    .select(`id, session_id, joined_at, last_heartbeat_at, stopped_at, lab_sessions(${sessionColumns})`)
    .eq("id", tokenRow.seat_id)
    .single();
  if (seatError) throw seatError;
  const session = seat.lab_sessions as unknown as SessionRow;
  const end = effectiveEnd(session);
  const joined = Date.parse(seat.joined_at);

  const rows: EventRow[] = [];
  // Only record what happened while the seat was meant to record.
  const latest = Math.min(now, end);
  const stoppedAt = seat.stopped_at ? Date.parse(seat.stopped_at) : null;
  if (stoppedAt === null || now - stoppedAt < LATE_EVENTS_MS) {
    for (const e of input.events) {
      rows.push({ type: e.type, detail: e.detail, at: new Date(clampTime(e.at, joined, latest)).toISOString() });
    }
  }

  const running = now < end && stoppedAt === null;
  const update: { last_heartbeat_at?: string; stopped_at?: string } = {};
  if (running) {
    const silentFor = now - Date.parse(seat.last_heartbeat_at);
    if (silentFor > SILENT_AFTER_MS) {
      rows.push({
        type: "heartbeat_gap",
        detail: { seconds: Math.round(silentFor / 1000) },
        at: new Date(now).toISOString(),
      });
    }
    update.last_heartbeat_at = new Date(now).toISOString();
    if (input.leave) {
      update.stopped_at = new Date(now).toISOString();
      rows.push({ type: "left", detail: {}, at: new Date(now).toISOString() });
    }
  } else if (stoppedAt === null) {
    // The session is over: close the seat at the end time.
    update.stopped_at = new Date(end).toISOString();
    rows.push({ type: "stopped", detail: {}, at: new Date(end).toISOString() });
  }

  if (Object.keys(update).length) {
    const { error } = await db.from("lab_seats").update(update).eq("id", seat.id);
    if (error) throw error;
  }
  await insertEvents(db, seat.session_id, seat.id, rows);

  return { ok: true, session: config(session, running && !input.leave) };
}

type EventRow = { type: ClientEvent["type"] | "joined" | "rejoined" | "left" | "stopped" | "heartbeat_gap"; detail: ClientEvent["detail"]; at: string };

async function insertEvents(db: Admin, sessionId: string, seatId: string, rows: EventRow[]) {
  if (rows.length === 0) return;
  const { error } = await db.from("lab_events").insert(
    rows.map((r) => ({ session_id: sessionId, seat_id: seatId, type: r.type, detail: r.detail as Json, at: r.at })),
  );
  if (error) throw error;
}
