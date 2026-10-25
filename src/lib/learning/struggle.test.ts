import { describe, expect, it } from "vitest";
import { detectStruggle, OFFER_COOLDOWN_MS, type TopicMessage } from "./struggle";

const now = Date.parse("2026-11-10T10:00:00Z");
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
const msg = (topic: string, intent: string, attemptQuality: number, hours = 1): TopicMessage => ({ topic, intent, attemptQuality, at: ago(hours) });

describe("detectStruggle", () => {
  it("spots many stuck questions on one idea", () => {
    const messages = [
      msg("polytropic process work", "answer_seeking", 0),
      msg("polytropic work", "concept_question", 0),
      msg("Polytropic process work", "answer_seeking", 0.2),
      msg("polytropic process work", "verify_answer", 0),
      msg("polytropic process work", "attempt", 0.6),
    ];
    expect(detectStruggle({ topic: "polytropic process work", messages, mistakes: [], mastery: null, lastOfferAt: null, now })).toEqual({
      struggling: true,
      reason: "stuck_questions",
    });
  });

  it("doesn't fire for a student who is trying", () => {
    const messages = Array.from({ length: 6 }, () => msg("polytropic process work", "attempt", 0.7));
    expect(detectStruggle({ topic: "polytropic process work", messages, mistakes: [], mastery: null, lastOfferAt: null, now }).struggling).toBe(false);
  });

  it("ignores other topics and old messages", () => {
    const messages = [
      ...Array.from({ length: 4 }, () => msg("entropy change", "answer_seeking", 0)),
      ...Array.from({ length: 4 }, () => msg("polytropic process work", "answer_seeking", 0, 24 * 9)),
      msg("polytropic process work", "answer_seeking", 0),
    ];
    expect(detectStruggle({ topic: "polytropic process work", messages, mistakes: [], mastery: null, lastOfferAt: null, now }).struggling).toBe(false);
  });

  it("fires on repeated mistakes on the topic", () => {
    expect(
      detectStruggle({
        topic: "entropy change",
        messages: [],
        mistakes: [
          { topic: "Entropy change", count: 2, reviewed: false },
          { topic: "entropy", count: 1, reviewed: false },
          { topic: "entropy change", count: 5, reviewed: true },
        ],
        mastery: null,
        lastOfferAt: null,
        now,
      }),
    ).toEqual({ struggling: true, reason: "repeated_mistakes" });
  });

  it("fires on low mastery after a couple of checks", () => {
    const r = detectStruggle({
      topic: "ideal gas law",
      messages: [msg("ideal gas law", "concept_question", 0.5), msg("ideal gas law", "attempt", 0.6)],
      mistakes: [],
      mastery: { mastery: 0.3, evidence: 2 },
      lastOfferAt: null,
      now,
    });
    expect(r).toEqual({ struggling: true, reason: "low_mastery" });
  });

  it("waits a few days before offering again", () => {
    const base = { topic: "entropy change", messages: [], mistakes: [{ topic: "entropy change", count: 4, reviewed: false }], mastery: null, now };
    expect(detectStruggle({ ...base, lastOfferAt: ago(5) }).struggling).toBe(false);
    expect(detectStruggle({ ...base, lastOfferAt: new Date(now - OFFER_COOLDOWN_MS - 1).toISOString() }).struggling).toBe(true);
  });
});
