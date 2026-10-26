import { z } from "zod";

/**
 * S21 photo of working, the pure parts: what the vision model returns, how a
 * confirmed transcription becomes the student's message to Sage, and when a
 * photo is deleted. Tested in transcript.test.ts.
 */

/** Images are removed from Storage this long after upload. */
export const PHOTO_TTL_DAYS = 30;
/** A photo that was never sent to Sage is removed sooner. */
export const UNSENT_TTL_HOURS = 24;
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoMimeType = (typeof PHOTO_MIME_TYPES)[number];
export const MAX_LINES = 40;
export const MAX_LINE_CHARS = 300;
/** Vision calls per student per hour (a photo takes one, or two if the first try fails): about 15–30 photos. */
export const VISION_CALLS_PER_HOUR = 30;

/** The vision model's reading of one photo. */
export const transcriptionSchema = z.object({
  /** False if the photo isn't handwritten working or can't be read at all. */
  readable: z.boolean(),
  /** One entry per written line, top to bottom, exactly as written (mistakes kept). */
  lines: z.array(z.string()).max(80),
  /** Anything that was hard to read, in one short sentence ("" if none). */
  note: z.string().max(600).default(""),
});
export type Transcription = z.infer<typeof transcriptionSchema>;

/** Trims, drops empty lines and line numbers the model added, and caps sizes. */
export function cleanLines(lines: readonly string[]): string[] {
  return lines
    .map((l) =>
      l
        .replace(/\r/g, "")
        .replace(/\s+/g, " ")
        // "1." / "L1:" / "Line 1 -" that the model put in front (ours are added when sending).
        .replace(/^\s*(?:line\s*|l)?\d{1,2}\s*[.):\-–]\s+/i, "")
        .trim()
        .slice(0, MAX_LINE_CHARS),
    )
    .filter(Boolean)
    .slice(0, MAX_LINES);
}

/** The editable text the student checks: one line of working per line. */
export function linesToEditable(lines: readonly string[]): string {
  return lines.join("\n");
}

export function editableToLines(text: string): string[] {
  return cleanLines(text.split("\n"));
}

export const PHOTO_MESSAGE_HEADER = "My working (from a photo I checked):";

/**
 * The message Sage receives once the student has confirmed the reading:
 * numbered lines so Sage can name "line 3", plus an optional question.
 */
export function photoMessageText(lines: readonly string[], question = ""): string {
  const numbered = cleanLines(lines).map((l, i) => `Line ${i + 1}: ${l}`);
  const ask = question.trim() || "Can you check my working and tell me where it first goes wrong?";
  return `${PHOTO_MESSAGE_HEADER}\n${numbered.join("\n")}\n\n${ask}`.slice(0, 4000);
}

/** True if a message is a confirmed photo transcription (for labels and the prompt). */
export function isPhotoMessage(text: string): boolean {
  return text.startsWith(PHOTO_MESSAGE_HEADER);
}

/** Whether the image should be removed now: 30 days after upload, or a day if it was never sent. */
export function photoExpired(photo: { createdAt: string; sentAt: string | null }, now = Date.now()): boolean {
  const age = now - Date.parse(photo.createdAt);
  if (!Number.isFinite(age)) return false;
  return photo.sentAt ? age >= PHOTO_TTL_DAYS * 86_400_000 : age >= UNSENT_TTL_HOURS * 3_600_000;
}

/** The cut-off times for the nightly clean-up query. */
export function cleanupCutoffs(now = Date.now()) {
  return {
    sent: new Date(now - PHOTO_TTL_DAYS * 86_400_000).toISOString(),
    unsent: new Date(now - UNSENT_TTL_HOURS * 3_600_000).toISOString(),
  };
}

/** Pulls the first JSON object out of a model's text reply (for providers without JSON mode). */
export function parseTranscriptionText(text: string): Transcription | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = transcriptionSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Checks the first bytes, so a renamed file can't pass as an image. */
export function sniffImageType(bytes: Uint8Array): PhotoMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export const VISION_SYSTEM = `You transcribe a photo of a college student's handwritten working (PHOTO-TRANSCRIBE).
Return JSON only: {"readable": boolean, "lines": string[], "note": string}.
- "lines": one entry per written line, top to bottom, EXACTLY as the student wrote it. Keep their mistakes, wrong numbers and wrong signs. Never correct, complete, solve or comment.
- Write maths in plain text: ^ for powers, / for division, * for multiplication, sqrt(), Greek letters as names (delta, theta). Keep units.
- Mark a word or symbol you can't read as [?]. Skip doodles and crossed-out text.
- If the photo isn't handwritten or printed working (a selfie, a screen, a blank page) or is too blurry, return readable: false and lines: [].
- "note": one short sentence about anything hard to read, or "".`;
