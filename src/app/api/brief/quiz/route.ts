import { getCurrentUser } from "@/lib/auth/dal";
import { startQuizSession } from "@/lib/brief/quiz";
import { startQuizSchema } from "@/lib/brief/quiz-schema";
import { createClient } from "@/lib/supabase/server";

/** POST: start a live run of a brief's quiz (course teacher). Returns the session id. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please log in again." }, { status: 401 });
  if (user.role !== "teacher") return Response.json({ error: "Only the course teacher can do this." }, { status: 403 });
  const parsed = startQuizSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That didn't come through. Please reload the page." }, { status: 400 });
  try {
    const sessionId = await startQuizSession(await createClient(), parsed.data.briefId, user.id);
    if (!sessionId) return Response.json({ error: "This brief has no quiz yet." }, { status: 404 });
    return Response.json({ sessionId });
  } catch (e) {
    console.error("Start quiz failed", e);
    return Response.json({ error: "The quiz didn't start. Please try again." }, { status: 500 });
  }
}
