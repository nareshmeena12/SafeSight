import { generateText, simulateReadableStream, streamText, wrapLanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { tokenCounts, usageMiddleware, type UsageRecord } from "./usage";

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 30, text: 30, reasoning: undefined },
};
const finish = { unified: "stop" as const, raw: undefined };
const tag = { feature: "sage_reply", userId: "u1" };

function tracked(model: MockLanguageModelV4) {
  const records: UsageRecord[] = [];
  const wrapped = wrapLanguageModel({ model, middleware: usageMiddleware({ tag, modelId: "main", record: (r) => records.push(r) }) });
  return { wrapped, records };
}

describe("usageMiddleware", () => {
  it("records a generate call's tokens with the responding model", async () => {
    const { wrapped, records } = tracked(
      new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [{ type: "text", text: "hi" }],
          finishReason: finish,
          usage,
          warnings: [],
          response: { modelId: "fallback-model" },
        }),
      }),
    );
    await generateText({ model: wrapped, prompt: "hi" });
    expect(records).toEqual([{ ...tag, model: "fallback-model", inputTokens: 120, outputTokens: 30, ok: true }]);
  });

  it("records a streamed call once, at the finish part", async () => {
    const { wrapped, records } = tracked(
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start" as const, warnings: [] },
              { type: "text-start" as const, id: "t" },
              { type: "text-delta" as const, id: "t", delta: "Let's work through this." },
              { type: "text-end" as const, id: "t" },
              { type: "finish" as const, finishReason: finish, usage },
            ],
          }),
        }),
      }),
    );
    const result = streamText({ model: wrapped, prompt: "hi" });
    expect(await result.text).toBe("Let's work through this.");
    expect(records).toEqual([{ ...tag, model: "main", inputTokens: 120, outputTokens: 30, ok: true }]);
  });

  it("records a failed call with zero tokens and rethrows", async () => {
    const { wrapped, records } = tracked(
      new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error("provider down");
        },
      }),
    );
    await expect(generateText({ model: wrapped, prompt: "hi", maxRetries: 0 })).rejects.toThrow();
    expect(records).toEqual([{ ...tag, model: "main", inputTokens: 0, outputTokens: 0, ok: false }]);
  });

  it("never lets a logging error break the call", async () => {
    const wrapped = wrapLanguageModel({
      model: new MockLanguageModelV4({
        doGenerate: async () => ({ content: [{ type: "text", text: "ok" }], finishReason: finish, usage, warnings: [] }),
      }),
      middleware: usageMiddleware({
        tag,
        modelId: "main",
        record: () => {
          throw new Error("db down");
        },
      }),
    });
    expect((await generateText({ model: wrapped, prompt: "hi" })).text).toBe("ok");
  });

  it("treats missing counts as zero", () => {
    expect(tokenCounts(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
