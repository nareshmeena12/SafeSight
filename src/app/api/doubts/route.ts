import { getCurrentUser } from "@/lib/auth/dal";
import { createDoubt } from "@/lib/doubts/data";
import { createDoubtSchema } from "@/lib/doubts/schemas";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/doubts — sends the student's question to their teacher and the
 * course's teaching assistants. The chat itself is shared with the teacher
 * only if the student ticked "Also share this chat".
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (user.role !== "student") return Response.json({ error: "Only students can ask a question here." }, { status: 403 });
  const parsed = createDoubtSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Please check your question and try again." }, { status: 400 });
  }
  const result = await createDoubt(await createClient(), user, parsed.data);
  if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
  return Response.json({ id: result.id });
}
