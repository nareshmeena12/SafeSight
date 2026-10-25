import type { UIMessage } from "ai";
import { z } from "zod";

/** A page of course material Sage used for a reply (shown as a chip). */
export const citationSchema = z.object({
  materialId: z.uuid(),
  title: z.string(),
  page: z.number().int().positive().nullable(),
});
export type Citation = z.infer<typeof citationSchema>;
export const citationsSchema = z.array(citationSchema);

/** Metadata on Sage's replies, streamed at start and finish. */
export type SageMetadata = {
  conversationId?: string;
  hintLevel?: number | null;
  citations?: Citation[];
  /** In Explore, the assignment whose rules applied to this reply. */
  rules?: { title: string; mode: "learn" | "assist" | "exam" } | null;
  /** The chat's course (for the learning tools under a reply). */
  courseId?: string;
  /** "Practice this" on the idea Sage just explained (Explore). */
  practice?: { topic: string } | null;
  /** After Sage checked a full attempt: explain the idea back in your own words. */
  explainBack?: { topic: string } | null;
  /** The student keeps struggling on this topic: a 5-minute refresher on a basic skill. */
  refresher?: { topic: string } | null;
};

/** Progress shown while Sage prepares a reply (transient: not kept in the message). */
export type SageStage = "reading" | "writing" | "checking";

/** Support resources shown with a reply when a student may be in distress. */
export type CareData = { counselling: string; helpline: string; helplineNumber: string };

export type SageUIMessage = UIMessage<SageMetadata, { care: CareData; status: { stage: SageStage } }>;

/**
 * Body of POST /api/sage. The server loads history itself; the client sends
 * only the new message. `message.id` is the idempotency key: sending the same
 * id twice (a retry or a double-send) is answered once. An assignment chat
 * sends `assignmentId`; Explore ("Ask Sage") sends `courseId` only.
 */
export const sageRequestSchema = z
  .object({
    assignmentId: z.uuid().nullish(),
    courseId: z.uuid().nullish(),
    conversationId: z.uuid().nullable(),
    message: z.object({
      id: z.string().min(8).max(100),
      text: z.string().trim().min(1, "Type a message first.").max(4000, "That message is a bit long — try splitting it up."),
    }),
  })
  .refine((b) => Boolean(b.assignmentId || b.courseId), "Pick a course or an assignment first.");
export type SageRequest = z.infer<typeof sageRequestSchema>;

