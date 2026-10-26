import { describe, expect, it } from "vitest";
import { decideOffers } from "./offers";

const context = { messages: [], mistakes: [], mastery: new Map(), offers: new Map() };

describe("decideOffers", () => {
  it("offers Practice this under a free explanation in Explore", () => {
    const o = decideOffers({ policy: { kind: "explain" }, labels: { intent: "concept", topic: "entropy", attemptQuality: 0 }, explore: true, context });
    expect(o.practice).toEqual({ topic: "Entropy" });
    expect(o.explainBack).toBeNull();
  });

  it("never offers practice on governed replies or in assignment chats", () => {
    expect(decideOffers({ policy: { kind: "ladder" }, labels: { intent: "answer_seeking", topic: "entropy", attemptQuality: 0 }, explore: true, context }).practice).toBeNull();
    expect(decideOffers({ policy: { kind: "explain" }, labels: { intent: "concept", topic: "entropy", attemptQuality: 0 }, explore: false, context }).practice).toBeNull();
  });

  it("asks to explain it back after a full attempt was checked", () => {
    const full = decideOffers({ policy: { kind: "check_work" }, labels: { intent: "attempt", topic: "boundary work", attemptQuality: 0.9 }, explore: false, context });
    expect(full.explainBack).toEqual({ topic: "Boundary work" });
    const partial = decideOffers({ policy: { kind: "check_work" }, labels: { intent: "attempt", topic: "boundary work", attemptQuality: 0.6 }, explore: false, context });
    expect(partial.explainBack).toBeNull();
  });

  it("offers a refresher when the student keeps struggling, instead of practice", () => {
    const o = decideOffers({
      policy: { kind: "explain" },
      labels: { intent: "concept", topic: "entropy change", attemptQuality: 0 },
      explore: true,
      context: { ...context, mistakes: [{ topic: "entropy change", count: 3, reviewed: false }] },
    });
    expect(o.refresher).toEqual({ topic: "Entropy change" });
    expect(o.practice).toBeNull();
  });

  it("offers nothing for care, exam or jailbreak replies, or without a topic", () => {
    for (const kind of ["care", "exam_off", "jailbreak"] as const) {
      expect(decideOffers({ policy: { kind }, labels: { intent: "concept", topic: "entropy", attemptQuality: 1 }, explore: true, context })).toEqual({
        practice: null,
        explainBack: null,
        refresher: null,
      });
    }
    expect(decideOffers({ policy: { kind: "explain" }, labels: { intent: "concept", topic: "", attemptQuality: 0 }, explore: true, context }).practice).toBeNull();
  });
});
