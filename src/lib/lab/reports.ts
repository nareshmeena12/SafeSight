import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { fetchPaged } from "@/lib/trace/paged";
import type { EventDetail } from "./describe";
import { LATE_EVENTS_MS } from "./constants";
import { computeSeatMetrics, labSummary } from "./report";
import { effectiveEnd, type SessionTimes } from "./status";

/**
 * S15: writes each seat's evidence summary once the session is over. Callers
 * must have checked that the user teaches the session (this uses the service
 * role, because reports are never written by browser roles). Re-running is
 * safe: rows are upserted per seat.
 */
export type WrittenReport = { seatId: string; summary: string; metrics: unknown; createdAt: string };

export async function writeLabReports(session: { id: string } & SessionTimes): Promise<WrittenReport[]> {
  const end = effectiveEnd(session);
  if (Date.now() < end) return [];
  const db = createAdminClient();

  const [{ data: seats, error: seatError }, events] = await Promise.all([
    db
      .from("lab_seats")
      .select("id, student_id, joined_at, last_heartbeat_at")
      .eq("session_id", session.id)
      .limit(1000),
    fetchPaged((from, to) =>
      db
        .from("lab_events")
        .select("seat_id, type, detail, at")
        .eq("session_id", session.id)
        .order("at")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (seatError) throw seatError;
  if (!seats.length) return [];

  const bySeat = new Map<string, typeof events>();
  for (const e of events) {
    const list = bySeat.get(e.seat_id) ?? [];
    list.push(e);
    bySeat.set(e.seat_id, list);
  }

  const rows = seats.map((seat) => {
    const metrics = computeSeatMetrics({
      joinedAt: seat.joined_at,
      lastHeartbeatAt: seat.last_heartbeat_at,
      sessionEnd: end,
      events: (bySeat.get(seat.id) ?? []).map((e) => ({ type: e.type, detail: (e.detail ?? {}) as EventDetail, at: e.at })),
    });
    return {
      seat_id: seat.id,
      session_id: session.id,
      student_id: seat.student_id,
      metrics: metrics as unknown as NonNullable<Json>,
      summary: labSummary(metrics),
      created_at: new Date().toISOString(),
    };
  });
  const { error } = await db.from("lab_reports").upsert(rows);
  if (error) throw error;
  return rows.map((r) => ({ seatId: r.seat_id, summary: r.summary, metrics: r.metrics, createdAt: r.created_at }));
}

/**
 * Writes reports when some are missing (the session ran out on its own), or
 * when they were written before the last event batches could arrive.
 * Returns the fresh rows (re-reading them in the same render would hit
 * Next's request memoisation and return the old list), or null.
 */
export async function ensureLabReports(
  session: { id: string } & SessionTimes,
  seatCount: number,
  reports: readonly { createdAt: string }[],
  now = Date.now(),
): Promise<WrittenReport[] | null> {
  const end = effectiveEnd(session);
  if (now < end || seatCount === 0) return null;
  const settled = end + LATE_EVENTS_MS;
  const missing = reports.length < seatCount;
  const early = now >= settled && reports.some((r) => Date.parse(r.createdAt) < settled);
  if (!missing && !early) return null;
  return writeLabReports(session);
}
