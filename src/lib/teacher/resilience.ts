import "server-only";
import { generateText, Output } from "ai";
import { chatModel } from "@/lib/ai/provider";
import {
  cleanResilience,
  RESILIENCE_SYSTEM_PROMPT,
  resiliencePrompt,
  resilienceSchema,
  type Resilience,
  type ResilienceRequest,
} from "./resilience-schema";

/** One structured call (30 s, one retry in the provider); a second try if the first breaks the wording rules. */
export async function checkResilience(
  request: ResilienceRequest,
  course: { name: string; code: string },
  userId: string,
): Promise<Resilience | null> {
  const model = chatModel({ feature: "ai_resilience", userId });
  for (let attempt = 0; attempt < 2; attempt++) {
    const { output } = await generateText({
      model,
      system: RESILIENCE_SYSTEM_PROMPT,
      prompt:
        resiliencePrompt(request, course) +
        (attempt ? "\n\nUse exactly one rewrite per approach and keep the wording neutral and encouraging." : ""),
      output: Output.object({ schema: resilienceSchema }),
      temperature: 0.3,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
    });
    const clean = cleanResilience(output);
    if (clean) return clean;
  }
  return null;
}
