import "server-only";
import { generateText, Output, type ModelMessage } from "ai";
import type { AiMode } from "@/components/product/mode-badge";
import { chatModel } from "@/lib/ai/provider";
import { heuristicLabels, labelsJsonShape, labelsSchema, mergeLabels, type Labels } from "./labels";
import { classifierPrompt } from "./prompt";

const CLASSIFY_TIMEOUT_MS = 8_000;

/**
 * classify_message: labels the student's latest message with structured JSON
 * output, merged with the keyword safety net. Never throws: if the model is
 * slow or returns bad JSON, the heuristic labels stand alone.
 */
export async function classifyMessage({
  text,
  history,
  mode,
}: {
  text: string;
  /** Recent conversation before this message. */
  history: ModelMessage[];
  mode: AiMode;
}): Promise<Labels> {
  const heuristic = heuristicLabels(text);
  let model: Labels | null = null;
  try {
    const context = history
      .slice(-6)
      .map((m) => `${m.role === "user" ? "Student" : "Sage"}: ${typeof m.content === "string" ? m.content : ""}`)
      .join("\n")
      .slice(-4000);
    const { output } = await generateText({
      model: chatModel(),
      system: classifierPrompt(labelsJsonShape, mode),
      prompt: `Recent conversation:\n${context || "(none)"}\n\nLatest student message:\n"""\n${text}\n"""`,
      output: Output.object({ schema: labelsSchema, name: "labels" }),
      temperature: 0,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
    });
    model = output;
  } catch (error) {
    console.warn("classify_message fell back to heuristic labels:", error instanceof Error ? error.message : error);
  }
  return mergeLabels(model, heuristic);
}
