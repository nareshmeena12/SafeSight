import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { ingestMaterial } from "@/lib/materials/ingest";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const bodySchema = z.object({
  courseId: z.uuid(),
  title: z.string().trim().min(1, "Give the file a title.").max(200, "Keep the title under 200 characters."),
  /** Storage path the browser uploaded to: <courseId>/<uuid>.pdf */
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i, "Upload the PDF first."),
});

/**
 * POST /api/materials — a teacher registers a PDF they uploaded to Storage;
 * the server extracts, chunks and embeds it for Sage's notes search.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (user.role === "student") return Response.json({ error: "Only teachers can add course materials." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Something was missing." }, { status: 400 });
  }
  const { courseId, title, path } = parsed.data;
  if (!path.startsWith(`${courseId}/`)) return Response.json({ error: "Upload the PDF first." }, { status: 400 });

  // Row-level security: only the course's teacher can add materials to it.
  const supabase = await createClient();
  const { data: material, error } = await supabase
    .from("materials")
    .insert({ course_id: courseId, title, file_path: path, status: "processing" })
    .select("id")
    .single();
  if (error || !material) {
    return Response.json({ error: "You can only add materials to your own courses." }, { status: 403 });
  }

  const result = await ingestMaterial(material.id);
  return Response.json({ id: material.id, ...result }, { status: result.status === "ready" ? 201 : 422 });
}
