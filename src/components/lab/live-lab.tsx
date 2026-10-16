"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Radio, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { describeAction, groupFeed, notableTypes, seatName, formatSeconds, type FeedEvent } from "@/lib/lab/describe";
import type { LabEvent, LabSeat } from "@/lib/lab/queries";
import { computeSeatMetrics } from "@/lib/lab/report";
import { attentionTypes, seatStatus, type SeatStatus } from "@/lib/lab/status";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { timeOnly, timeSeconds } from "./format";

export const statusMeta: Record<SeatStatus, { label: string; dot: string; tile: string }> = {
  ok: { label: "Recording", dot: "bg-good", tile: "border-border" },
  attention: { label: "Needs a look", dot: "bg-warning", tile: "border-warning/60 bg-warning/5" },
  silent: { label: "No signal", dot: "bg-critical", tile: "border-critical/60 bg-critical/5" },
  done: { label: "Stopped", dot: "bg-text-muted/50", tile: "border-border opacity-80" },
};

type SeatRow = {
  id: string;
  session_id: string;
  student_id: string | null;
  roll_number: string;
  seat_label: string;
  joined_at: string;
  last_heartbeat_at: string;
  stopped_at: string | null;
};

const collator = new Intl.Collator("en", { numeric: true });

/**
 * The live seat grid, event feed and seat timeline (S14). Seats and events
 * arrive through Supabase Realtime (RLS applies, so only the course teacher
 * receives them), with a quiet poll every 15 s as a safety net. A seat with no
 * heartbeat for 30 s turns red on the next tick.
 */
export function LiveLab({
  sessionId,
  endsAt,
  ended,
  initialSeats,
  initialEvents,
}: {
  sessionId: string;
  /** Effective end (ISO). */
  endsAt: string;
  ended: boolean;
  initialSeats: LabSeat[];
  initialEvents: LabEvent[];
}) {
  const [seats, setSeats] = useState<Map<string, LabSeat>>(() => new Map(initialSeats.map((s) => [s.id, s])));
  const [events, setEvents] = useState<Map<number, LabEvent>>(() => new Map(initialEvents.map((e) => [e.id, e])));
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState<boolean | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [openSeat, setOpenSeat] = useState<string | null>(null);
  const names = useRef(new Map<string, string>());
  const endMs = Date.parse(endsAt);
  const sessionEnded = ended || now >= endMs;

  // Clock for the 30-second silence rule.
  useEffect(() => {
    if (sessionEnded) return;
    const t = setInterval(() => setNow(Date.now()), 2_000);
    return () => clearInterval(t);
  }, [sessionEnded]);

  // Realtime + safety-net poll.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    function upsertSeat(row: SeatRow) {
      setSeats((prev) => {
        const next = new Map(prev);
        const old = prev.get(row.id);
        next.set(row.id, {
          id: row.id,
          studentId: row.student_id,
          studentName: row.student_id ? (names.current.get(row.student_id) ?? old?.studentName ?? null) : null,
          rollNumber: row.roll_number,
          seatLabel: row.seat_label,
          joinedAt: row.joined_at,
          lastHeartbeatAt: row.last_heartbeat_at,
          stoppedAt: row.stopped_at,
        });
        return next;
      });
      if (row.student_id && !names.current.has(row.student_id)) void loadName(row.id, row.student_id);
    }

    async function loadName(seatId: string, studentId: string) {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", studentId).maybeSingle();
      if (!data?.full_name || cancelled) return;
      names.current.set(studentId, data.full_name);
      setSeats((prev) => {
        const seat = prev.get(seatId);
        if (!seat) return prev;
        return new Map(prev).set(seatId, { ...seat, studentName: data.full_name });
      });
    }

    function addEvents(rows: LabEvent[]) {
      if (!rows.length) return;
      setEvents((prev) => {
        const next = new Map(prev);
        for (const r of rows) next.set(r.id, { ...r, detail: r.detail ?? {} });
        return next;
      });
    }

    const channel = supabase.channel(`lab:${sessionId}`);
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lab_events", filter: `session_id=eq.${sessionId}` },
        (payload) => addEvents([payload.new as LabEvent]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lab_seats", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          upsertSeat(payload.new as SeatRow);
        },
      );
    // Join with the teacher's token, or Realtime checks RLS as anon and sends nothing.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => {
        if (!cancelled) setConnected(status === "SUBSCRIBED");
      });
    });

    async function poll() {
      const [{ data: seatRows }, { data: eventRows }] = await Promise.all([
        supabase
          .from("lab_seats")
          .select("id, session_id, student_id, roll_number, seat_label, joined_at, last_heartbeat_at, stopped_at")
          .eq("session_id", sessionId)
          .limit(1000),
        supabase
          .from("lab_events")
          .select("id, seat_id, type, detail, at")
          .eq("session_id", sessionId)
          .gte("at", new Date(Date.now() - 60_000).toISOString())
          .order("at")
          .limit(1000),
      ]);
      if (cancelled) return;
      for (const row of seatRows ?? []) upsertSeat(row);
      addEvents((eventRows ?? []) as LabEvent[]);
    }
    const timer = sessionEnded ? null : setInterval(() => void poll(), 15_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [sessionId, sessionEnded]);

  const eventList = useMemo(() => [...events.values()], [events]);

  const attention = useMemo(() => {
    const counts = new Map<string, { attention: number; blocked: number; tabs: number; pastes: number }>();
    for (const e of eventList) {
      const c = counts.get(e.seat_id) ?? { attention: 0, blocked: 0, tabs: 0, pastes: 0 };
      if (attentionTypes.has(e.type)) c.attention += 1;
      if (e.type === "blocked_site") c.blocked += 1;
      if (e.type === "tab_switch") c.tabs += 1;
      if (e.type === "paste") c.pastes += 1;
      counts.set(e.seat_id, c);
    }
    return counts;
  }, [eventList]);

  const seatList = useMemo(
    () =>
      [...seats.values()]
        .map((s) => {
          const c = attention.get(s.id) ?? { attention: 0, blocked: 0, tabs: 0, pastes: 0 };
          const status = seatStatus(
            { last_heartbeat_at: s.lastHeartbeatAt, stopped_at: s.stoppedAt },
            c.attention,
            sessionEnded,
            now,
          );
          return { ...s, status, counts: c };
        })
        .sort((a, b) => collator.compare(a.seatLabel, b.seatLabel)),
    [seats, attention, sessionEnded, now],
  );

  const totals = useMemo(() => {
    const t: Record<SeatStatus, number> = { ok: 0, attention: 0, silent: 0, done: 0 };
    for (const s of seatList) t[s.status] += 1;
    return t;
  }, [seatList]);

  const seatById = useMemo(() => new Map(seatList.map((s) => [s.id, s])), [seatList]);
  const feed = useMemo(
    () => groupFeed(eventList.filter((e) => showAll || notableTypes.has(e.type)) as FeedEvent[]).slice(0, 200),
    [eventList, showAll],
  );
  const silentSeats = seatList.filter((s) => s.status === "silent");
  const selected = openSeat ? seatById.get(openSeat) : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section aria-labelledby="seats-heading" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="seats-heading" className="text-title">
            Seats <span className="font-mono text-mono text-muted-foreground">{seatList.length}</span>
          </h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-muted-foreground" aria-label="Seat colours">
            {(["ok", "attention", "silent", "done"] as const).map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={cn("size-2 rounded-full", statusMeta[k].dot)} />
                {statusMeta[k].label} <span className="font-mono">{totals[k]}</span>
              </li>
            ))}
          </ul>
        </div>

        {!sessionEnded && connected === false ? (
          <p className="mb-4 flex items-center gap-2 rounded-md border px-4 py-3 text-small text-muted-foreground" role="status">
            <WifiOff className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            Live updates are reconnecting. The grid still refreshes every 15 seconds.
          </p>
        ) : null}

        {seatList.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-surface/60 px-6 py-12 text-center">
            <p className="text-title">No seats yet</p>
            <p className="mx-auto mt-1 max-w-md text-small text-muted-foreground">
              {sessionEnded
                ? "Nobody joined this session."
                : "Seats appear here as students enter their roll number and the code in the SafeSight Lab extension."}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {seatList.map((s) => {
              const meta = statusMeta[s.status];
              const silentFor = Math.round((now - Date.parse(s.lastHeartbeatAt)) / 1000);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setOpenSeat(s.id)}
                    className={cn(
                      "flex min-h-28 w-full flex-col items-start gap-1 rounded-lg border bg-surface p-4 text-left transition-[border-color,background-color] duration-150 ease-out hover:border-border-strong",
                      meta.tile,
                    )}
                    aria-label={`${seatName(s.seatLabel)}, ${s.studentName ?? s.rollNumber}: ${meta.label}`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="font-mono text-mono">{s.seatLabel}</span>
                      <span aria-hidden="true" className={cn("size-2.5 rounded-full", meta.dot)} />
                    </span>
                    <span className="w-full truncate text-small">{s.studentName ?? s.rollNumber}</span>
                    <span className="w-full truncate text-xs text-muted-foreground">
                      {s.status === "silent"
                        ? `No signal for ${formatSeconds(silentFor)}`
                        : s.counts.blocked
                          ? `${s.counts.blocked} blocked ${s.counts.blocked === 1 ? "attempt" : "attempts"}`
                          : s.status === "done"
                            ? s.stoppedAt
                              ? `Stopped ${timeOnly.format(new Date(s.stoppedAt))}`
                              : meta.label
                            : s.studentName
                              ? s.rollNumber
                              : "Not linked to an account"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside aria-labelledby="feed-heading" className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="feed-heading" className="flex items-center gap-2 text-title">
            {!sessionEnded ? <Radio className="size-4 text-primary" strokeWidth={1.5} aria-hidden="true" /> : null}
            Activity
          </h2>
          <div className="flex rounded-md border p-0.5 text-small" role="group" aria-label="Which activity to show">
            {[
              { all: false, label: "Notable" },
              { all: true, label: "Everything" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={showAll === o.all}
                onClick={() => setShowAll(o.all)}
                className={cn(
                  "min-h-9 rounded-sm px-3 transition-colors duration-150 ease-out",
                  showAll === o.all ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {silentSeats.length ? (
          <ul className="mb-4 grid gap-2" aria-label="Seats with no signal">
            {silentSeats.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpenSeat(s.id)}
                  className="flex min-h-11 w-full items-start gap-2 rounded-md border border-critical/50 bg-critical/5 px-3 py-2 text-left text-small"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" strokeWidth={1.5} aria-hidden="true" />
                  <span>
                    <strong className="font-medium">{seatName(s.seatLabel)}</strong> has sent no signal for{" "}
                    {formatSeconds((now - Date.parse(s.lastHeartbeatAt)) / 1000)}. The browser may be closed or the
                    extension turned off.
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {feed.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-small text-muted-foreground">
            {showAll ? "Nothing recorded yet." : "Nothing notable yet. Blocked sites, moves to other apps and silences show here."}
          </p>
        ) : (
          <ol className="grid max-h-[70dvh] gap-1 overflow-y-auto rounded-lg border bg-surface p-2" aria-live="polite">
            {feed.map((item) => {
              const seat = seatById.get(item.seatId);
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setOpenSeat(item.seatId)}
                    className="flex min-h-11 w-full items-start gap-3 rounded-md px-2 py-2 text-left text-small hover:bg-hover"
                  >
                    <time className="w-12 shrink-0 font-mono text-xs leading-5 text-muted-foreground" dateTime={item.at}>
                      {timeOnly.format(new Date(item.at))}
                    </time>
                    <span className="min-w-0">
                      {item.type === "blocked_site" || item.type === "heartbeat_gap" ? (
                        <span aria-hidden="true" className="mr-1.5 inline-block size-1.5 rounded-full bg-warning align-middle" />
                      ) : null}
                      <strong className="font-medium">{seat ? seatName(seat.seatLabel) : "A seat"}</strong>{" "}
                      {describeAction(item.type, item.detail, item.count)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </aside>

      <SeatSheet
        seat={selected}
        events={selected ? eventList.filter((e) => e.seat_id === selected.id) : []}
        sessionEnd={Math.min(now, endMs)}
        onClose={() => setOpenSeat(null)}
      />
    </div>
  );
}

function SeatSheet({
  seat,
  events,
  sessionEnd,
  onClose,
}: {
  seat: (LabSeat & { status: SeatStatus }) | undefined;
  events: LabEvent[];
  sessionEnd: number;
  onClose: () => void;
}) {
  const sorted = [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const metrics = seat
    ? computeSeatMetrics({ joinedAt: seat.joinedAt, lastHeartbeatAt: seat.lastHeartbeatAt, sessionEnd, events })
    : null;

  return (
    <Sheet open={Boolean(seat)} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {seat && metrics ? (
          <>
            <SheetHeader>
              <SheetTitle>{seatName(seat.seatLabel)}</SheetTitle>
              <SheetDescription>
                {seat.studentName ? `${seat.studentName} · ${seat.rollNumber}` : `Roll number ${seat.rollNumber}`}
              </SheetDescription>
              <div>
                <Badge variant={seat.status === "ok" ? "good" : seat.status === "attention" ? "warning" : seat.status === "silent" ? "critical" : "secondary"}>
                  {statusMeta[seat.status].label}
                </Badge>
              </div>
            </SheetHeader>
            <div className="grid gap-6 px-4 pb-6">
              {!seat.studentId ? (
                <p className="text-small text-muted-foreground">
                  This roll number isn&apos;t linked to a student in the course. Students add their roll number on
                  SafeSight under Lab sessions.
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-3">
                {[
                  ["Blocked attempts", metrics.blockedAttempts],
                  ["Tab switches", metrics.tabSwitches],
                  ["Other apps", metrics.leftBrowser],
                  ["Pastes", metrics.pastes],
                  ["Idle", `${Math.round(metrics.idleMinutes)} min`],
                  ["No signal", metrics.silentPeriods],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border p-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-mono text-mono">{value}</dd>
                  </div>
                ))}
              </dl>
              <section aria-label="Timeline">
                <h3 className="mb-2 text-label">Timeline</h3>
                {sorted.length === 0 ? (
                  <p className="text-small text-muted-foreground">Nothing recorded yet.</p>
                ) : (
                  <ol className="grid gap-0 border-l pl-4">
                    {sorted.map((e) => (
                      <li key={e.id} className="relative py-1.5 text-small">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute top-3 -left-[21px] size-2 rounded-full border bg-surface",
                            attentionTypes.has(e.type) && "border-warning bg-warning",
                          )}
                        />
                        <time className="mr-2 font-mono text-xs text-muted-foreground" dateTime={e.at}>
                          {timeSeconds.format(new Date(e.at))}
                        </time>
                        {describeAction(e.type, e.detail)}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
