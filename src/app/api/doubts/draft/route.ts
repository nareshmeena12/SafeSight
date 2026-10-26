import { getCurrentUser } from "@/lib/auth/dal";
import { draftDoubt } from "@/lib/doubts/data";
import { draftRequestSchema } from "@/lib/doubts/schemas";
import { createClient } from "@/lib/supabase/server";

/** Two summary attempts of 20 s each. */
export const maxDuration = 45;

/**
 * POST /api/doubts/draft {conversationId} — "Still stuck? Ask your teacher":
 * a summary of the student's own chat (question, what they tried, where
 * they're stuck) for them to check and edit. Nothing is sent to the teacher.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (user.role !== "student") return Response.json({ error: "Questions to teachers come from students' chats." }, { status: 403 });
  const parsed = draftRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "We couldn't find this chat. Please reload the page." }, { status: 400 });

  const draft = await draftDoubt(await createClient(), user.id, parsed.data.conversationId);
  if (!draft) return Response.json({ error: "We couldn't find this chat. Please reload the page." }, { status: 404 });
  return Response.json(draft);
}
