import type { LanguageModelMiddleware } from "ai";

type WrapStream = NonNullable<LanguageModelMiddleware["wrapStream"]>;
type WrapGenerate = NonNullable<LanguageModelMiddleware["wrapGenerate"]>;
type Model = Parameters<WrapStream>[0]["model"];
type CallOptions = Parameters<WrapStream>[0]["params"];
type StreamResult = Awaited<ReturnType<WrapStream>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

class SlowModelError extends Error {
  constructor(ms: number) {
    super(`No response within ${ms} ms`);
    this.name = "SlowModelError";
  }
}

/** Parts that carry no model output yet: wait past them for the first real one. */
const preamble = new Set<string>(["stream-start", "response-metadata"]);

/**
 * Demo mode (PLAN.md §12): if the main model hasn't started answering within
 * `slowMs` — or fails before it starts — the call switches to `fallback`.
 * Streams switch only before the first token, so a student never sees a reply
 * restart halfway. Pure: the provider decides when to apply it.
 */
export function fallbackMiddleware({
  fallback,
  slowMs,
  onSwitch,
}: {
  fallback: Model;
  slowMs: number;
  onSwitch?: (reason: string) => void;
}): LanguageModelMiddleware {
  /** The main model's call gets its own abort signal, so a slow call is cancelled when we switch. */
  const withCancel = (params: CallOptions) => {
    const controller = new AbortController();
    const signal = params.abortSignal ? AbortSignal.any([params.abortSignal, controller.signal]) : controller.signal;
    return { params: { ...params, abortSignal: signal }, cancel: () => controller.abort() };
  };
  const switchReason = (error: unknown) => (error instanceof Error ? error.message : String(error));
  const callerAborted = (params: CallOptions) => params.abortSignal?.aborted === true;

  const wrapStream: WrapStream = async ({ params, model }) => {
    const main = withCancel(params);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SlowModelError(slowMs)), slowMs);
    });

    try {
      const result = await Promise.race([model.doStream(main.params), deadline]);
      const reader = result.stream.getReader();
      // Read until the first part with real output (or the end), within the deadline.
      const buffered: StreamPart[] = [];
      for (;;) {
        const next = await Promise.race([reader.read(), deadline]);
        if (next.done) break;
        buffered.push(next.value);
        if (next.value.type === "error") throw next.value.error;
        if (!preamble.has(next.value.type)) break;
      }
      clearTimeout(timer);
      const stream = new ReadableStream<StreamPart>({
        start(controller) {
          for (const part of buffered) controller.enqueue(part);
        },
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) controller.close();
          else controller.enqueue(value);
        },
        cancel(reason) {
          return reader.cancel(reason);
        },
      });
      return { ...result, stream };
    } catch (error) {
      clearTimeout(timer);
      main.cancel();
      if (callerAborted(params)) throw error;
      onSwitch?.(switchReason(error));
      return fallback.doStream(params);
    }
  };

  const wrapGenerate: WrapGenerate = async ({ params, model }) => {
    const main = withCancel(params);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SlowModelError(slowMs)), slowMs);
    });
    try {
      return await Promise.race([model.doGenerate(main.params), deadline]);
    } catch (error) {
      main.cancel();
      if (callerAborted(params)) throw error;
      onSwitch?.(switchReason(error));
      return fallback.doGenerate(params);
    } finally {
      clearTimeout(timer);
    }
  };

  return { specificationVersion: "v4", wrapStream, wrapGenerate };
}
