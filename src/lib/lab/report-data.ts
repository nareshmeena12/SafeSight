import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getLabSession, listReports, listSeats, type LabSeat, type LabSession } from "./queries";
import type { SeatMetrics } from "./report";
import { ensureLabReports } from "./reports";
import { sessionState } from "./status";

export type SeatReport = { seat: LabSeat; summary: string | null; metrics: SeatMetrics | null };

/**
 * Everything the report page and CSV need. Reads under RLS (so it returns null
 * unless the user teaches the session), and writes missing summaries first
 * when the session is over.
 */
export async function loadLabReport(
  db: SupabaseClient<Database>,
  sessionId: string,
): Promise<{ session: LabSession; ended: boolean; rows: SeatReport[] } | null> {
  const session = await getLabSession(db, sessionId);
  if (!session) return null;
  const times = { id: session.id, starts_at: session.startsAt, ends_at: session.endsAt, ended_at: session.endedAt };
  const ended = sessionState(times, Date.now()) === "ended";
  const seats = await listSeats(db, session.id);
  const stored = await listReports(db, session.id);
  const reports = (ended ? await ensureLabReports(times, seats.length, stored) : null) ?? stored;
  const bySeat = new Map(reports.map((r) => [r.seatId, r]));
  const collator = new Intl.Collator("en", { numeric: true });
  const rows = seats
    .map((seat) => {
      const r = bySeat.get(seat.id);
      return { seat, summary: r?.summary ?? null, metrics: (r?.metrics as SeatMetrics | undefined) ?? null };
    })
    .sort((a, b) => collator.compare(a.seat.seatLabel, b.seat.seatLabel));
  return { session, ended, rows };
}
