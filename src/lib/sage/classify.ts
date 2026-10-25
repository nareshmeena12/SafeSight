import "server-only";
import { generateText, Output, type LanguageModelUsage, type ModelMessage } from "ai";
import { aiProviderOptions, chatModel } from "@/lib/ai/provider";
import {
  classifierJsonShape,
  classifierOutputSchema,
  heuristicLabels,
  mergeLabels,
  type Labels,
} from "./labels";
import { bestMatch, candidateRefs, type SageAssignment } from "./match";
import { classifierPrompt } from "./prompt";

export const CLASSIFY_TIMEOUT_MS = Number(process.env.SAGE_CLASSIFY_MS) || 4_000;

/**
 * classify_message: intent, attempt quality and the best-matching active
 * assignment, with structured JSON output, merged with the keyword safety net
 * and a lexical match. Never throws: if the model is slow or returns bad
 * JSON, the heuristic labels and the lexical match stand alone.
 */
export async function classifyMessage({
  text,
  history,
  home,
  candidates,
  signal,
  onUsage,
}: {
  text: string;
  /** Recent conversation before this message. */
  history: ModelMessage[];
  /** The chat's own assignment, or null in Explore. */
  home: SageAssignment | null;
  /** The student's active assignments in this course (including home). */
  candidates: SageAssignment[];
  signal?: AbortSignal;
  /** Tokens used, for ai_usage. */
  onUsage?: (usage: LanguageModelUsage | undefined) => void;
}): Promise<Labels> {
  const heuristic = heuristicLabels(text);
  const refs = candidateRefs(candidates);
  let model: ReturnType<typeof classifierOutputSchema.parse> | null = null;
  try {
    const context = history
      .slice(-6)
      .map((m) => `${m.role === "user" ? "Student" : "Sage"}: ${typeof m.content === "string" ? m.content.slice(0, 700) : ""}`)
      .join("\n")
      .slice(-3500);
    const list = refs.length
      ? refs
          .map(
            ({ ref, assignment: a }) =>
              `${ref}${a.id === home?.id ? " (this chat's assignment)" : ""}: "${a.title}" [${a.mode}, ${a.kind}] ${a.instructions.replace(/\s+/g, " ").slice(0, 500)}`,
          )
          .join("\n")
      : "(none)";
    const { output, usage } = await generateText({
      model: chatModel(),
      system: classifierPrompt(classifierJsonShape),
      prompt: `ACTIVE ASSIGNMENTS:\n${list}\n\nChat: ${home ? `assignment chat for ${refs.find((r) => r.assignment.id === home.id)?.ref ?? "?"}` : "Explore (not tied to an assignment)"}\n\nRecent conversation:\n${context || "(none)"}\n\nLatest student message:\n"""\n${text.slice(0, 4000)}\n"""`,
      output: Output.object({ schema: classifierOutputSchema, name: "labels" }),
      temperature: 0,
      maxOutputTokens: 300,
      providerOptions: aiProviderOptions(),
      maxRetries: 0,
      abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(CLASSIFY_TIMEOUT_MS)]) : AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
    });
    model = output;
    onUsage?.(usage);
  } catch (error) {
    console.warn("classify_message fell back to heuristic labels:", error instanceof Error ? error.message : error);
  }
  const match = bestMatch(text, candidates, model?.match ?? null);
  return { ...mergeLabels(model ? { ...model, match } : null, heuristic), match };
}
