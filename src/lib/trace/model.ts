import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * The chat model for the Trace agent, from AI_BASE_URL / AI_API_KEY / AI_MODEL,
 * or null when they are not set (Trace then uses its template summary).
 * TODO(S4 merge): switch to the shared provider helper once Sage lands.
 */
export function traceModel() {
  const baseURL = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!baseURL || !apiKey || !model) return null;
  return createOpenAICompatible({ name: "safesight", baseURL, apiKey }).chatModel(model);
}
