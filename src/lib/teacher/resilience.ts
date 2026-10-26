import "server-only";
import { generateJson } from "@/lib/learning/ai";
import {
  cleanResilience,
  RESILIENCE_SYSTEM_PROMPT,
  resiliencePrompt,
  resilienceSchema,
  type Resilience,
  type ResilienceRequest,
} from "./resilience-schema";

/**
 * Streamed structured call (S17's generateJson: the provider's slow-start retry
 * judges the first token, not the whole answer, so three full rewrites aren't
 * cut off), 40 s timeout, one more attempt on bad JSON; a second round if the
 * result repeats an approach or uses banned words.
 */
export async function checkResilience(
  request: ResilienceRequest,
  course: { name: string; code: string },
  userId: string,
): Promise<Resilience | null> {
  for (let round = 0; round < 2; round++) {
    const output = await generateJson({
      feature: "ai_resilience",
      userId,
      system: RESILIENCE_SYSTEM_PROMPT,
      prompt:
        resiliencePrompt(request, course) +
        (round ? "\n\nUse exactly one rewrite per approach and keep the wording neutral and encouraging." : ""),
      schema: resilienceSchema,
      name: "resilience",
      timeoutMs: 40_000,
      maxOutputTokens: 4000,
      temperature: 0.3,
    });
    if (!output) return null;
    const clean = cleanResilience(output);
    if (clean) return clean;
  }
  return null;
}
