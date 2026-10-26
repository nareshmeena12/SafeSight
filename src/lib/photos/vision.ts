import "server-only";
import { Output, generateText } from "ai";
import { visionModel } from "@/lib/ai/provider";
import {
  VISION_SYSTEM,
  cleanLines,
  parseTranscriptionText,
  transcriptionSchema,
  type PhotoMimeType,
  type Transcription,
} from "./transcript";

const TIMEOUT_MS = 30_000;

/**
 * Reads one photo of working with the vision model (AI_VISION_MODEL).
 * Attempt 1 asks for structured JSON; attempt 2 (after a failure, a timeout
 * or JSON that doesn't fit) asks for plain text and parses the JSON out of
 * it, for providers that don't take JSON mode with images. Returns null when
 * both fail or vision isn't configured. Tokens go to ai_usage (sage_photo).
 */
export async function transcribePhoto({
  bytes,
  mimeType,
  userId,
}: {
  bytes: Uint8Array;
  mimeType: PhotoMimeType;
  userId: string;
}): Promise<Transcription | null> {
  const model = visionModel({ feature: "sage_photo", userId });
  if (!model) return null;
  const messages = [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: "Transcribe this photo of my working. JSON only." },
        { type: "file" as const, mediaType: mimeType, data: bytes },
      ],
    },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let result: Transcription | null;
      if (attempt === 0) {
        const { output } = await generateText({
          model,
          system: VISION_SYSTEM,
          messages,
          output: Output.object({ schema: transcriptionSchema, name: "transcription" }),
          temperature: 0,
          maxOutputTokens: 2000,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        });
        result = output;
      } else {
        const { text } = await generateText({
          model,
          system: VISION_SYSTEM,
          messages,
          temperature: 0,
          maxOutputTokens: 2000,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        });
        result = parseTranscriptionText(text);
      }
      if (result) {
        const lines = cleanLines(result.lines);
        return { readable: result.readable && lines.length > 0, lines, note: result.note.trim().slice(0, 500) };
      }
    } catch (error) {
      console.warn(`sage_photo attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : error);
    }
  }
  return null;
}
