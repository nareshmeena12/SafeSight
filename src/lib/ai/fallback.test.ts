import { generateText, simulateReadableStream, streamText, wrapLanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { fallbackMiddleware } from "./fallback";

const usage = {
  inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};
const finish = { unified: "stop" as const, raw: undefined };

function streamingModel(text: string, initialDelayInMs: number | null = null) {
  return new MockLanguageModelV4({
    modelId: text,
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs,
        chunks: [
          { type: "stream-start" as const, warnings: [] },
          { type: "text-start" as const, id: "t" },
          { type: "text-delta" as const, id: "t", delta: text },
          { type: "text-end" as const, id: "t" },
          { type: "finish" as const, finishReason: finish, usage },
        ],
      }),
    }),
  });
}

function generatingModel(text: string, delayMs = 0) {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      await new Promise((r) => setTimeout(r, delayMs));
      return { content: [{ type: "text", text }], finishReason: finish, usage, warnings: [] };
    },
  });
}

async function streamed(model: Parameters<typeof wrapLanguageModel>[0]["model"]) {
  const result = streamText({ model, prompt: "hi" });
  return await result.text;
}

describe("demo mode fallback", () => {
  it("keeps the main model when it answers in time", async () => {
    const onSwitch = vi.fn();
    const model = wrapLanguageModel({
      model: streamingModel("main"),
      middleware: fallbackMiddleware({ fallback: streamingModel("fallback"), slowMs: 200, onSwitch }),
    });
    expect(await streamed(model)).toBe("main");
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("switches to the fallback when the first token is slow", async () => {
    const onSwitch = vi.fn();
    const model = wrapLanguageModel({
      model: streamingModel("main", 500),
      middleware: fallbackMiddleware({ fallback: streamingModel("fallback"), slowMs: 50, onSwitch }),
    });
    expect(await streamed(model)).toBe("fallback");
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it("switches to the fallback when the main model fails", async () => {
    const broken = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("503 from provider");
      },
    });
    const model = wrapLanguageModel({
      model: broken,
      middleware: fallbackMiddleware({ fallback: streamingModel("fallback"), slowMs: 1_000 }),
    });
    expect(await streamed(model)).toBe("fallback");
  });

  it("does the same for one-shot calls (labels, Trace summary)", async () => {
    const slow = wrapLanguageModel({
      model: generatingModel("main", 300),
      middleware: fallbackMiddleware({ fallback: generatingModel("fallback"), slowMs: 50 }),
    });
    expect((await generateText({ model: slow, prompt: "hi" })).text).toBe("fallback");

    const fast = wrapLanguageModel({
      model: generatingModel("main"),
      middleware: fallbackMiddleware({ fallback: generatingModel("fallback"), slowMs: 200 }),
    });
    expect((await generateText({ model: fast, prompt: "hi" })).text).toBe("main");
  });
});

describe("demo mode fallback, sticky", () => {
  it("skips the slow main model for later calls once it has switched", async () => {
    const main = streamingModel("main", 300);
    const state = { skipMainUntil: 0 };
    const make = () =>
      wrapLanguageModel({
        model: main,
        middleware: fallbackMiddleware({ fallback: streamingModel("fallback"), slowMs: 50, stickyMs: 60_000, state }),
      });
    expect(await streamed(make())).toBe("fallback");
    const started = Date.now();
    expect(await streamed(make())).toBe("fallback");
    expect(Date.now() - started).toBeLessThan(50);
    expect(main.doStreamCalls).toHaveLength(1);
  });
});
