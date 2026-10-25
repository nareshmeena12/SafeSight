import "server-only";
import { generateText, Output, type LanguageModelUsage } from "ai";
import { aiProviderOptions, chatModel } from "@/lib/ai/provider";
import { guardJsonShape, guardVerdictSchema, type GuardVerdict } from "./guard";
import type { Policy } from "./policy";
import { guardPrompt } from "./prompt";

export const GUARD_TIMEOUT_MS = Number(process.env.SAGE_GUARD_MS) || 6_000;

/**
 * Output guard, part 2: a second, cheap model call that reads the draft with
 * the assignment, its private answer key and the forbidden list. Returns null
 * when the call fails, so the caller can decide what is safe without it.
 */
export async function modelGuard({
  draft,
  policy,
  studentMessage,
  signal,
  onUsage,
}: {
  draft: string;
  policy: Policy;
  studentMessage: string;
  signal?: AbortSignal;
  onUsage?: (usage: LanguageModelUsage | undefined) => void;
}): Promise<GuardVerdict | null> {
  const g = policy.governing;
  try {
    const { output, usage } = await generateText({
      model: chatModel(),
      system: guardPrompt(guardJsonShape),
      prompt: `ASSIGNMENT: ${g ? `"${g.title}" — ${g.mode.toUpperCase()} mode, ${g.kind}` : "none matched (general learning); the student asked for work to hand in"}
INSTRUCTIONS:
"""
${g?.instructions.slice(0, 3000) ?? ""}
"""
PRIVATE ANSWER KEY:
"""
${g?.answerKey.slice(0, 3000) || "(none provided)"}
"""
REPLY TYPE: ${policy.kind}${policy.step ? `, ladder step ${policy.step}` : ""}
FORBIDDEN:
${policy.forbidden.map((f) => `- ${f}`).join("\n")}

STUDENT'S MESSAGE:
"""
${studentMessage.slice(0, 2000)}
"""

DRAFT REPLY:
"""
${draft.slice(0, 6000)}
"""`,
      output: Output.object({ schema: guardVerdictSchema, name: "verdict" }),
      temperature: 0,
      maxOutputTokens: 200,
      providerOptions: aiProviderOptions(),
      maxRetries: 0,
      abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(GUARD_TIMEOUT_MS)]) : AbortSignal.timeout(GUARD_TIMEOUT_MS),
    });
    onUsage?.(usage);
    return output;
  } catch (error) {
    console.warn("sage guard call failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
