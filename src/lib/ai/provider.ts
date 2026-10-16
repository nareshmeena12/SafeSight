import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel } from "ai";
import { z } from "zod";
import { fallbackMiddleware, type FallbackState } from "./fallback";

/**
 * The model provider (OpenAI-compatible: DeepInfra or OpenRouter). Server
 * only: keys never reach the browser, and every model call lives in a route
 * handler or a script.
 *
 *   AI_BASE_URL, AI_API_KEY, AI_MODEL       chat model (Sage, labels, Lens, Trace)
 *   AI_FALLBACK_MODEL                       one automatic retry goes to this model when the main
 *                                           one fails or hasn't started answering within
 *                                           AI_SLOW_MS (default 10000; 5000 in demo mode).
 *                                           Without it, the retry goes to the main model again.
 *   DEMO_MODE=true                          after a switch, stay on the fallback for 5 minutes
 *   EMBEDDING_MODEL                         1024-dimension model, e.g. BAAI/bge-m3
 *   EMBEDDING_BASE_URL, EMBEDDING_API_KEY   optional; default to AI_BASE_URL / AI_API_KEY
 *   AI_STRUCTURED_OUTPUTS=true              send json_schema instead of json_object
 */

const optional = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .optional();

const aiEnvSchema = z.object({
  AI_BASE_URL: optional.pipe(z.url().optional()),
  AI_API_KEY: optional,
  AI_MODEL: optional,
  AI_FALLBACK_MODEL: optional,
  EMBEDDING_MODEL: optional,
  EMBEDDING_BASE_URL: optional.pipe(z.url().optional()),
  EMBEDDING_API_KEY: optional,
  AI_STRUCTURED_OUTPUTS: optional,
  DEMO_MODE: optional,
  AI_SLOW_MS: optional.pipe(z.coerce.number<string | undefined>().int().min(500).max(60_000).optional()),
});

function aiEnv() {
  return aiEnvSchema.parse({
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
    AI_FALLBACK_MODEL: process.env.AI_FALLBACK_MODEL,
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
    EMBEDDING_BASE_URL: process.env.EMBEDDING_BASE_URL,
    EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY,
    AI_STRUCTURED_OUTPUTS: process.env.AI_STRUCTURED_OUTPUTS,
    DEMO_MODE: process.env.DEMO_MODE,
    AI_SLOW_MS: process.env.AI_SLOW_MS,
  });
}

export class AiNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Model provider is not configured. Set ${missing.join(", ")}.`);
    this.name = "AiNotConfiguredError";
  }
}

/** Which parts of the provider are configured (no secrets). */
export function aiStatus() {
  const env = aiEnv();
  return {
    chat: Boolean(env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL),
    /** Demo mode is on and has a fallback model to switch to. */
    demoFallback: demoFallbackModel(env) !== null,
    embeddings: Boolean(
      (env.EMBEDDING_BASE_URL ?? env.AI_BASE_URL) &&
        (env.EMBEDDING_API_KEY ?? env.AI_API_KEY) &&
        env.EMBEDDING_MODEL,
    ),
  };
}

const DEFAULT_SLOW_MS = 10_000;
const DEMO_SLOW_MS = 5_000;
/** After the main model was slow, demo mode uses the fallback for this long. */
const FALLBACK_STICKY_MS = 5 * 60_000;
/** Per server instance, shared by every chatModel() call. */
const fallbackState: FallbackState = { skipMainUntil: 0 };

function demoFallbackModel(env: ReturnType<typeof aiEnv>) {
  const on = env.DEMO_MODE === "true" && env.AI_FALLBACK_MODEL && env.AI_FALLBACK_MODEL !== env.AI_MODEL;
  return on ? env.AI_FALLBACK_MODEL! : null;
}

function fallbackModelId(env: ReturnType<typeof aiEnv>) {
  return env.AI_FALLBACK_MODEL && env.AI_FALLBACK_MODEL !== env.AI_MODEL ? env.AI_FALLBACK_MODEL : null;
}

/**
 * The chat model for Sage, the labeller, the output guard, Lens and the Trace
 * agent. Throws if unconfigured. Every call gets one automatic retry: if the
 * main model fails, or hasn't started answering within AI_SLOW_MS, the call
 * is cancelled and retried on AI_FALLBACK_MODEL (or the main model again when
 * no fallback is set). Streams only switch before the first token. In demo
 * mode, after a switch every call goes straight to the fallback for 5 minutes.
 */
export function chatModel() {
  const env = aiEnv();
  const missing = [
    !env.AI_BASE_URL && "AI_BASE_URL",
    !env.AI_API_KEY && "AI_API_KEY",
    !env.AI_MODEL && "AI_MODEL",
  ].filter((m): m is string => Boolean(m));
  if (missing.length) throw new AiNotConfiguredError(missing);

  const provider = createOpenAICompatible({
    name: "safesight",
    baseURL: env.AI_BASE_URL!,
    apiKey: env.AI_API_KEY,
    supportsStructuredOutputs: env.AI_STRUCTURED_OUTPUTS === "true",
  });
  const main = provider.chatModel(env.AI_MODEL!);
  const fallback = fallbackModelId(env);
  const demo = demoFallbackModel(env) !== null;
  const slowMs = env.AI_SLOW_MS ?? (demo ? DEMO_SLOW_MS : DEFAULT_SLOW_MS);
  return wrapLanguageModel({
    model: main,
    middleware: fallbackMiddleware({
      fallback: fallback ? provider.chatModel(fallback) : main,
      slowMs,
      stickyMs: demo ? FALLBACK_STICKY_MS : 0,
      state: fallbackState,
      onSwitch: (reason) => console.warn(`ai retry: ${env.AI_MODEL} → ${fallback ?? env.AI_MODEL} (${reason})`),
    }),
  });
}

/** The embedding model for notes search, or null if unconfigured. */
export function embeddingModel() {
  const env = aiEnv();
  const baseURL = env.EMBEDDING_BASE_URL ?? env.AI_BASE_URL;
  const apiKey = env.EMBEDDING_API_KEY ?? env.AI_API_KEY;
  if (!baseURL || !apiKey || !env.EMBEDDING_MODEL) return null;
  return createOpenAICompatible({ name: "safesight-embeddings", baseURL, apiKey }).embeddingModel(
    env.EMBEDDING_MODEL,
  );
}
