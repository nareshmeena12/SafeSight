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
};

/** Support resources shown with a reply when a student may be in distress. */
export type CareData = { counselling: string; helpline: string; helplineNumber: string };

export type SageUIMessage = UIMessage<SageMetadata, { care: CareData }>;

/** Body of POST /api/sage. The server loads history itself; the client sends only the new message. */
export const sageRequestSchema = z.object({
  assignmentId: z.uuid(),
  conversationId: z.uuid().nullable(),
  message: z.object({
    id: z.string().min(1).max(100),
    text: z.string().trim().min(1, "Type a message first.").max(4000, "That message is a bit long — try splitting it up."),
  }),
});
export type SageRequest = z.infer<typeof sageRequestSchema>;

export const SEARCH_TOOL = "search_course_material";
