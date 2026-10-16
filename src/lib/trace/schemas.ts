import { z } from "zod";

/** Event types the Trace editor records (matches the `writing_event_type` enum). */
export const writingEventTypes = ["type", "paste", "delete", "focus", "blur"] as const;
export type WritingEventType = (typeof writingEventTypes)[number];

/** One recorded editing event. `at` is epoch milliseconds on the client. */
export const writingEventSchema = z.object({
  type: z.enum(writingEventTypes),
  size: z.number().int().min(0).max(1_000_000),
  at: z.number().int().positive(),
});
export type WritingEvent = z.infer<typeof writingEventSchema>;

/** Largest editor HTML we accept (also enforced by a check constraint). */
export const MAX_CONTENT_LENGTH = 400_000;

/** A batch the editor sends every ~5s, and once more on submit. */
export const traceBatchSchema = z.object({
  events: z.array(writingEventSchema).max(2_000),
  /** The document as editor HTML, only when it changed since the last batch. */
  content: z.string().max(MAX_CONTENT_LENGTH).optional(),
  /** Plain-text length of `content`. */
  charCount: z.number().int().min(0).max(MAX_CONTENT_LENGTH).optional(),
});
export type TraceBatch = z.infer<typeof traceBatchSchema>;

export const submissionIdSchema = z.uuid();
