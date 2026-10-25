import type { LanguageModelMiddleware } from "ai";

type WrapStream = NonNullable<LanguageModelMiddleware["wrapStream"]>;
type WrapGenerate = NonNullable<LanguageModelMiddleware["wrapGenerate"]>;
type StreamResult = Awaited<ReturnType<WrapStream>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
type Usage = Awaited<ReturnType<WrapGenerate>>["usage"];

/** Who an AI call is for, so its tokens can be logged to ai_usage. */
export type UsageTag = {
  /** sage_classify, sage_reply, sage_guard, lens, trace_summary, … (lower snake case). */
  feature: string;
  /** The signed-in user the call serves; null for scripts and evals. */
  userId: string | null;
};

export type UsageRecord = UsageTag & { model: string; inputTokens: number; outputTokens: number; ok: boolean };

export function tokenCounts(usage: Usage | undefined) {
  return {
    inputTokens: Math.max(0, Math.round(usage?.inputTokens.total ?? 0)),
    outputTokens: Math.max(0, Math.round(usage?.outputTokens.total ?? 0)),
  };
}

/**
 * Reports the tokens of every model call (one record per call, failures
 * included) to `record`. The model id is the one that actually answered
 * (after a fallback switch), when the provider says so. Pure: the provider
 * decides where records go.
 */
export function usageMiddleware({
  tag,
  modelId,
  record,
}: {
  tag: UsageTag;
  /** Used when the response doesn't name its model. */
  modelId: string;
  record: (r: UsageRecord) => void;
}): LanguageModelMiddleware {
  const report = (model: string | undefined, usage: Usage | undefined, ok: boolean) => {
    try {
      record({ ...tag, model: model || modelId, ...tokenCounts(usage), ok });
    } catch {
      // Logging never breaks a reply.
    }
  };

  const wrapGenerate: WrapGenerate = async ({ doGenerate }) => {
    try {
      const result = await doGenerate();
      report(result.response?.modelId, result.usage, true);
      return result;
    } catch (error) {
      report(undefined, undefined, false);
      throw error;
    }
  };

  const wrapStream: WrapStream = async ({ doStream }) => {
    let result: StreamResult;
    try {
      result = await doStream();
    } catch (error) {
      report(undefined, undefined, false);
      throw error;
    }
    let model: string | undefined;
    let done = false;
    const finish = (usage: Usage | undefined, ok: boolean) => {
      if (done) return;
      done = true;
      report(model, usage, ok);
    };
    const reader = result.stream.getReader();
    const stream = new ReadableStream<StreamPart>({
      async pull(controller) {
        let next: ReadableStreamReadResult<StreamPart>;
        try {
          next = await reader.read();
        } catch (error) {
          finish(undefined, false);
          controller.error(error);
          return;
        }
        if (next.done) {
          // A stream that ends without a finish part (cut off) is still a call.
          finish(undefined, false);
          controller.close();
          return;
        }
        const part = next.value;
        if (part.type === "response-metadata" && part.modelId) model = part.modelId;
        if (part.type === "finish") finish(part.usage, true);
        if (part.type === "error") finish(undefined, false);
        controller.enqueue(part);
      },
      // Stopped by the caller (the student pressed Stop): the tokens so far aren't reported, the call is.
      cancel(reason) {
        finish(undefined, false);
        return reader.cancel(reason);
      },
    });
    return { ...result, stream };
  };

  return { specificationVersion: "v4", wrapGenerate, wrapStream };
}
