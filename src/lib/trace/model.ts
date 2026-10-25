import "server-only";
import { aiStatus, chatModel } from "@/lib/ai/provider";

/**
 * The chat model for the Trace agent: the shared provider (lib/ai/provider.ts,
 * with demo mode's fallback), or null when it is not configured (Trace then
 * uses its template summary).
 */
export function traceModel(userId: string | null) {
  return aiStatus().chat ? chatModel({ feature: "trace_summary", userId }) : null;
}
