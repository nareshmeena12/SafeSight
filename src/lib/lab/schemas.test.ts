import { describe, expect, it } from "vitest";
import { heartbeatSchema, joinSchema, labSessionSchema, rollNumberFormSchema } from "./schemas";

describe("joinSchema", () => {
  it("normalises the code and roll number", () => {
    const r = joinSchema.parse({ code: "123 456", rollNumber: " me 23b014 " });
    expect(r).toMatchObject({ code: "123456", rollNumber: "ME23B014" });
  });
  it("rejects bad codes and roll numbers", () => {
    expect(joinSchema.safeParse({ code: "12345", rollNumber: "A1" }).success).toBe(false);
    expect(joinSchema.safeParse({ code: "123456", rollNumber: "" }).success).toBe(false);
    expect(joinSchema.safeParse({ code: "123456", rollNumber: "A1<script>" }).success).toBe(false);
  });
});

describe("heartbeatSchema", () => {
  it("accepts known client events with small details", () => {
    const r = heartbeatSchema.parse({ events: [{ type: "paste", detail: { chars: 40 }, at: 1 }] });
    expect(r.events[0]).toEqual({ type: "paste", detail: { chars: 40 }, at: 1 });
  });
  it("never accepts text or server-only events", () => {
    expect(heartbeatSchema.safeParse({ events: [{ type: "paste", detail: { text: "secret" }, at: 1 }] }).success).toBe(false);
    expect(heartbeatSchema.safeParse({ events: [{ type: "heartbeat_gap", at: 1 }] }).success).toBe(false);
    expect(heartbeatSchema.safeParse({ events: [{ type: "joined", at: 1 }] }).success).toBe(false);
  });
});

describe("labSessionSchema", () => {
  const base = {
    courseId: "00000000-0000-4000-8000-000000000001",
    title: "Lab exam 2",
    startsAt: "2026-11-05T10:00",
    durationMinutes: "120",
  };
  it("reads the start as India time and adds the length", () => {
    const r = labSessionSchema.parse({ ...base, blocklist: "stackoverflow.com" });
    expect(r.startsAt.toISOString()).toBe("2026-11-05T04:30:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-11-05T06:30:00.000Z");
    expect(r.blocklist).toEqual(["stackoverflow.com"]);
    expect(r.room).toBe("");
  });
  it("points at the field that is wrong", () => {
    const r = labSessionSchema.safeParse({ ...base, blocklist: "not a site" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path[0]).toBe("blocklist");
    expect(labSessionSchema.safeParse({ ...base, durationMinutes: "5" }).success).toBe(false);
  });
});

describe("rollNumberFormSchema", () => {
  it("allows clearing", () => {
    expect(rollNumberFormSchema.parse({ rollNumber: "" }).rollNumber).toBe("");
    expect(rollNumberFormSchema.parse({ rollNumber: "me23/014" }).rollNumber).toBe("ME23/014");
  });
});
