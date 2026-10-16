import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * The chat model for Lens, from server-only env vars (AI_BASE_URL, AI_API_KEY,
 * AI_MODEL; AI_FALLBACK_MODEL when DEMO_MODE=true). Returns null when the
 * provider is not configured so the route can answer with a friendly message.
 */
export function lensModel() {
  const baseURL = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const demo = process.env.DEMO_MODE === "true";
  const modelId = (demo && process.env.AI_FALLBACK_MODEL) || process.env.AI_MODEL;
  if (!baseURL || !apiKey || !modelId) return null;

  const provider = createOpenAICompatible({ name: "safesight-ai", baseURL, apiKey });
  return provider.chatModel(modelId);
}
