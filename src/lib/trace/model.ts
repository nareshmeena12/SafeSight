import "server-only";
import { aiStatus, chatModel } from "@/lib/ai/provider";

/**
 * The chat model for the Trace agent: the shared provider (lib/ai/provider.ts,
 * with demo mode's fallback), or null when it is not configured (Trace then
 * uses its template summary).
 */
export function traceModel() {
  return aiStatus().chat ? chatModel() : null;
}
