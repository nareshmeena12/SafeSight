import { describe, expect, it } from "vitest";
import { canJoin, clampTime, effectiveEnd, seatStatus, sessionState } from "./status";

const t = (hhmm: string) => Date.parse(`2026-11-05T${hhmm}:00+05:30`);
const session = { starts_at: "2026-11-05T10:00:00+05:30", ends_at: "2026-11-05T12:00:00+05:30", ended_at: null };

describe("sessions", () => {
  it("moves from upcoming to live to ended", () => {
    expect(sessionState(session, t("09:59"))).toBe("upcoming");
    expect(sessionState(session, t("10:00"))).toBe("live");
    expect(sessionState(session, t("12:00"))).toBe("ended");
  });
  it("ends early when the teacher ends it", () => {
    const early = { ...session, ended_at: "2026-11-05T11:00:00+05:30" };
    expect(effectiveEnd(early)).toBe(t("11:00"));
    expect(sessionState(early, t("11:30"))).toBe("ended");
  });
  it("opens joining 15 minutes before the start", () => {
    expect(canJoin(session, t("09:40"))).toBe("too_early");
    expect(canJoin(session, t("09:45"))).toBe("open");
    expect(canJoin(session, t("12:01"))).toBe("ended");
  });
});

describe("seat colours", () => {
  const now = t("10:30");
  const beat = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
  it("is green while heartbeats arrive", () => {
    expect(seatStatus({ last_heartbeat_at: beat(9), stopped_at: null }, 0, false, now)).toBe("ok");
  });
  it("is amber after a blocked site", () => {
    expect(seatStatus({ last_heartbeat_at: beat(9), stopped_at: null }, 1, false, now)).toBe("attention");
  });
  it("is red after 30 seconds without a heartbeat", () => {
    expect(seatStatus({ last_heartbeat_at: beat(30), stopped_at: null }, 0, false, now)).toBe("ok");
    expect(seatStatus({ last_heartbeat_at: beat(31), stopped_at: null }, 2, false, now)).toBe("silent");
  });
  it("is grey once stopped or the session is over", () => {
    expect(seatStatus({ last_heartbeat_at: beat(300), stopped_at: beat(300) }, 0, false, now)).toBe("done");
    expect(seatStatus({ last_heartbeat_at: beat(300), stopped_at: null }, 0, true, now)).toBe("done");
  });
  it("clamps lab PC clocks", () => {
    expect(clampTime(5, 10, 20)).toBe(10);
    expect(clampTime(25, 10, 20)).toBe(20);
    expect(clampTime(15, 10, 20)).toBe(15);
  });
});
