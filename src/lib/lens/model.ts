import "server-only";
import { aiStatus, chatModel } from "@/lib/ai/provider";

/**
 * The chat model for Lens: the shared provider (lib/ai/provider.ts), so demo
 * mode's slow-model fallback applies here too. Null when the provider is not
 * configured, so the route can answer with a friendly message.
 */
export function lensModel(userId: string) {
  return aiStatus().chat ? chatModel({ feature: "lens", userId }) : null;
}
