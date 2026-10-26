import { getCurrentUser } from "@/lib/auth/dal";
import { closeQuizSession, teacherQuizView } from "@/lib/brief/quiz";
import { quizSessionIdSchema } from "@/lib/brief/quiz-schema";
import { createClient } from "@/lib/supabase/server";

async function teacherAndId(params: Promise<{ sessionId: string }>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please log in again." }, { status: 401 });
  if (user.role !== "teacher" && user.role !== "admin") return Response.json({ error: "Not allowed." }, { status: 403 });
  const id = quizSessionIdSchema.safeParse((await params).sessionId);
  if (!id.success) return Response.json({ error: "Not found." }, { status: 404 });
  return id.data;
}

/** GET: live counts per option (polled by the results screen). */
export async function GET(_request: Request, { params }: RouteContext<"/api/brief/quiz/[sessionId]">) {
  const id = await teacherAndId(params);
  if (id instanceof Response) return id;
  const view = await teacherQuizView(await createClient(), id);
  if (!view) return Response.json({ error: "This quiz wasn't found." }, { status: 404 });
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}

/** PATCH: close the quiz; students then see the answers. */
export async function PATCH(_request: Request, { params }: RouteContext<"/api/brief/quiz/[sessionId]">) {
  const id = await teacherAndId(params);
  if (id instanceof Response) return id;
  try {
    const ok = await closeQuizSession(await createClient(), id);
    if (!ok) return Response.json({ error: "This quiz wasn't found." }, { status: 404 });
    return Response.json({ closed: true });
  } catch (e) {
    console.error("Close quiz failed", e);
    return Response.json({ error: "That didn't save. Please try again." }, { status: 500 });
  }
}
