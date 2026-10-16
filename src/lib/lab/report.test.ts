import { describe, expect, it } from "vitest";
import { usesBannedWords } from "@/lib/trace/summary";
import { describeAction, groupFeed, seatName } from "./describe";
import { computeSeatMetrics, csvField, csvHeader, csvRow, labSummary, toCsv, type ReportEvent } from "./report";

const at = (hhmmss: string) => `2026-11-05T${hhmmss}+05:30`;
const end = Date.parse(at("12:00:00"));

describe("computeSeatMetrics", () => {
  const events: ReportEvent[] = [
    { type: "joined", detail: {}, at: at("10:01:00") },
    { type: "blocked_site", detail: { host: "chatgpt.com" }, at: at("10:20:00") },
    { type: "blocked_site", detail: { host: "chat.openai.com" }, at: at("10:20:30") },
    { type: "blocked_site", detail: { host: "gemini.google.com" }, at: at("10:40:00") },
    { type: "tab_switch", detail: { host: "docs.python.org" }, at: at("10:05:00") },
    { type: "left_browser", detail: {}, at: at("10:30:00") },
    { type: "returned", detail: { seconds: 120 }, at: at("10:32:00") },
    { type: "copy", detail: { chars: 10 }, at: at("10:33:00") },
    { type: "paste", detail: { chars: 300 }, at: at("10:34:00") },
    { type: "paste", detail: { chars: 40 }, at: at("10:35:00") },
    { type: "idle", detail: {}, at: at("11:00:00") },
    { type: "active", detail: { seconds: 360 }, at: at("11:06:00") },
    { type: "heartbeat_gap", detail: { seconds: 90 }, at: at("11:10:00") },
  ];

  it("counts what happened", () => {
    const m = computeSeatMetrics({ joinedAt: at("10:01:00"), lastHeartbeatAt: at("11:59:55"), sessionEnd: end, events });
    expect(m.blockedAttempts).toBe(3);
    expect(m.blockedSites).toEqual([
      { site: "ChatGPT", count: 2 },
      { site: "Gemini", count: 1 },
    ]);
    expect(m.tabSwitches).toBe(1);
    expect(m.leftBrowser).toBe(1);
    expect(m.awayMinutes).toBeCloseTo(2);
    expect(m.copies).toBe(1);
    expect(m.pastes).toBe(2);
    expect(m.pastedChars).toBe(340);
    expect(m.idlePeriods).toBe(1);
    expect(m.idleMinutes).toBeCloseTo(6);
    expect(m.silentPeriods).toBe(1);
    expect(m.silentMinutes).toBeCloseTo(1.5);
    expect(m.finishedEarly).toBe(false);
    expect(m.presentMinutes).toBeCloseTo(119);
  });

  it("counts a silence that lasted until the end, and away/idle still open", () => {
    const m = computeSeatMetrics({
      joinedAt: at("10:00:00"),
      lastHeartbeatAt: at("11:30:00"),
      sessionEnd: end,
      events: [
        { type: "left_browser", detail: {}, at: at("11:50:00") },
        { type: "idle", detail: {}, at: at("11:55:00") },
      ],
    });
    expect(m.silentPeriods).toBe(1);
    expect(m.silentMinutes).toBeCloseTo(30);
    expect(m.awayMinutes).toBeCloseTo(10);
    expect(m.idleMinutes).toBeCloseTo(5);
  });

  it("ends at the time the student finished", () => {
    const m = computeSeatMetrics({
      joinedAt: at("10:00:00"),
      lastHeartbeatAt: at("11:00:00"),
      sessionEnd: end,
      events: [{ type: "left", detail: {}, at: at("11:00:00") }],
    });
    expect(m.finishedEarly).toBe(true);
    expect(m.presentMinutes).toBeCloseTo(60);
    expect(m.silentPeriods).toBe(0);
  });
});

describe("labSummary", () => {
  it("states facts in neutral words", () => {
    const m = computeSeatMetrics({
      joinedAt: at("10:01:00"),
      lastHeartbeatAt: at("11:59:55"),
      sessionEnd: end,
      events: [
        { type: "blocked_site", detail: { host: "chatgpt.com" }, at: at("10:20:00") },
        { type: "blocked_site", detail: { host: "chatgpt.com" }, at: at("10:21:00") },
        { type: "paste", detail: { chars: 1240 }, at: at("10:34:00") },
        { type: "copy", detail: { chars: 5 }, at: at("10:33:00") },
        { type: "tab_switch", detail: {}, at: at("10:05:00") },
        { type: "rejoined", detail: {}, at: at("10:50:00") },
      ],
    });
    const text = labSummary(m);
    expect(text).toContain("Joined at 10:01 and recorded until the session ended at 12:00");
    expect(text).toContain("blocked 2 attempts to open a blocked site: ChatGPT twice");
    expect(text).toContain("Switched tabs once");
    expect(text).toContain("Used copy once and paste once (1,240 characters pasted)");
    expect(text).toContain("Joined again once");
    expect(usesBannedWords(text)).toBe(false);
  });

  it("says plainly when nothing of note happened", () => {
    const m = computeSeatMetrics({ joinedAt: at("10:00:00"), lastHeartbeatAt: at("12:00:00"), sessionEnd: end, events: [] });
    expect(labSummary(m)).toBe(
      "Joined at 10:00 and recorded until the session ended at 12:00 (2 hours). No blocked sites were opened.",
    );
  });
});

describe("feed", () => {
  it("groups repeats like PLAN.md's example", () => {
    const items = groupFeed([
      { id: 1, seat_id: "s14", type: "blocked_site", detail: { host: "chatgpt.com" }, at: at("10:20:00") },
      { id: 2, seat_id: "s14", type: "blocked_site", detail: { host: "chatgpt.com" }, at: at("10:21:00") },
      { id: 3, seat_id: "s2", type: "joined", detail: {}, at: at("10:00:00") },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]!.count).toBe(2);
    expect(`${seatName("14")} ${describeAction(items[0]!.type, items[0]!.detail, items[0]!.count)}`).toBe(
      "Seat 14 tried to open ChatGPT twice",
    );
    expect(seatName("PC-14")).toBe("PC-14");
  });
  it("never uses banned words", () => {
    const types = ["joined", "rejoined", "left", "stopped", "tab_switch", "left_browser", "returned", "copy", "paste", "blocked_site", "idle", "active", "heartbeat_gap"] as const;
    for (const t of types) expect(usesBannedWords(describeAction(t, { host: "a.com", chars: 3, seconds: 40 }, 2))).toBe(false);
  });
});

describe("CSV", () => {
  it("escapes quotes, commas and formulas", () => {
    expect(csvField('He said "hi", then')).toBe('"He said ""hi"", then"');
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField(null)).toBe("");
    expect(toCsv([["a", 1], ["b", 2]])).toBe("a,1\r\nb,2\r\n");
  });
  it("has one value per header", () => {
    const m = computeSeatMetrics({ joinedAt: at("10:00:00"), lastHeartbeatAt: at("12:00:00"), sessionEnd: end, events: [] });
    expect(csvRow({ seatLabel: "14", rollNumber: "ME23B014", studentName: "Riya Sharma" }, m, "x")).toHaveLength(csvHeader.length);
  });
});
