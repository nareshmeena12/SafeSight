import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeMetrics } from "./metrics";

vi.mock("server-only", () => ({}));
const model = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("./model", () => ({ traceModel: () => model.current }));

const { writeSummary } = await import("./report");

function mockModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

const metrics = computeMetrics(
  [
    { type: "type", size: 100, at: Date.UTC(2026, 9, 16, 9, 0) },
    { type: "paste", size: 400, at: Date.UTC(2026, 9, 16, 9, 2) },
  ],
  { chars: 500, pastedChars: 400 },
);

describe("writeSummary (the Trace agent)", () => {
  beforeEach(() => {
    model.current = null;
  });

  it("uses the template when no model is configured", async () => {
    expect(await writeSummary(metrics)).toMatchObject({ source: "template" });
  });

  it("uses the model's structured summary", async () => {
    model.current = mockModel(JSON.stringify({ summary: "Written in 1 session, 2 minutes active. One paste at 14:32." }));
    expect(await writeSummary(metrics)).toEqual({
      source: "model",
      summary: "Written in 1 session, 2 minutes active. One paste at 14:32.",
    });
  });

  it("falls back when the model's wording breaks the rules", async () => {
    model.current = mockModel(JSON.stringify({ summary: "The student probably cheated using a paste." }));
    expect(await writeSummary(metrics)).toMatchObject({ source: "template" });
  });

  it("falls back when the model returns malformed output", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    model.current = mockModel("not json");
    expect(await writeSummary(metrics)).toMatchObject({ source: "template" });
  });
});
