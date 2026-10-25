import "server-only";
import { Output, streamText } from "ai";
import type { z } from "zod";
import { aiProviderOptions, chatModel } from "@/lib/ai/provider";
import { logAiUsage, type AiFeature } from "./usage";

/**
 * One structured-JSON model call for the learning tools: streamed (so the
 * provider's slow-start retry judges the first token, not the whole answer),
 * with a timeout, one more attempt if the first fails or returns JSON that
 * doesn't fit the schema, and the tokens logged to ai_usage. Returns null
 * when both attempts fail, so every caller can show a friendly message.
 */
export async function generateJson<T>({
  feature,
  userId,
  system,
  prompt,
  schema,
  name,
  timeoutMs = 25_000,
  maxOutputTokens = 1200,
  temperature = 0.3,
  attempts = 2,
  signal,
}: {
  feature: AiFeature;
  userId: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  name: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  temperature?: number;
  attempts?: number;
  signal?: AbortSignal;
}): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) return null;
    let streamError: unknown = null;
    try {
      const result = streamText({
        model: chatModel(),
        system,
        prompt,
        output: Output.object({ schema, name }),
        temperature: attempt ? Math.max(0, temperature - 0.2) : temperature,
        maxOutputTokens,
        maxRetries: 0,
        providerOptions: aiProviderOptions(),
        abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        onError: ({ error }) => {
          streamError = error;
        },
      });
      const output = await result.output;
      void result.usage.then((u) => logAiUsage(userId, feature, u), () => {});
      return output;
    } catch (error) {
      const reason = streamError ?? error;
      console.warn(`${feature} attempt ${attempt + 1} failed:`, reason instanceof Error ? reason.message : reason);
    }
  }
  return null;
}
