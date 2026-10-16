import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

/**
 * The model provider (OpenAI-compatible: DeepInfra or OpenRouter). Server
 * only: keys never reach the browser, and every model call lives in a route
 * handler or a script.
 *
 *   AI_BASE_URL, AI_API_KEY, AI_MODEL       chat model (Sage, labels)
 *   AI_FALLBACK_MODEL                       used when DEMO_MODE=true (S12 adds slow-model fallback)
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
    embeddings: Boolean(
      (env.EMBEDDING_BASE_URL ?? env.AI_BASE_URL) &&
        (env.EMBEDDING_API_KEY ?? env.AI_API_KEY) &&
        env.EMBEDDING_MODEL,
    ),
  };
}

/** The chat model for Sage and the labeller. Throws if unconfigured. */
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
  const demo = env.DEMO_MODE === "true" && env.AI_FALLBACK_MODEL;
  return provider.chatModel(demo ? env.AI_FALLBACK_MODEL! : env.AI_MODEL!);
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
