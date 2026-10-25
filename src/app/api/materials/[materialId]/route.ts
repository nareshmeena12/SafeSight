import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { MATERIALS_BUCKET } from "@/lib/materials/constants";
import { allowIngest, ingestMaterial } from "@/lib/materials/ingest";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

async function ownMaterial(params: Promise<{ materialId: string }>) {
  const user = await getCurrentUser();
  if (!user || user.role === "student") return null;
  const { materialId } = await params;
  if (!z.uuid().safeParse(materialId).success) return null;
  const supabase = await createClient();
  // Teachers read materials of their own courses (RLS); confirm they teach it.
  const { data } = await supabase
    .from("materials")
    .select("id, file_path, course_id, courses!inner(teacher_id)")
    .eq("id", materialId)
    .eq("courses.teacher_id", user.id)
    .maybeSingle();
  return data ? { supabase, material: data, userId: user.id } : null;
}

/** POST /api/materials/:id — read the PDF again (e.g. after adding an embedding model). */
export async function POST(_req: Request, { params }: RouteContext<"/api/materials/[materialId]">) {
  const found = await ownMaterial(params);
  if (!found) return Response.json({ error: "We couldn't find this material in your courses." }, { status: 404 });
  if (!(await allowIngest(found.userId))) {
    return Response.json({ error: "You've added a lot of notes this hour. Please try again in a little while." }, { status: 429 });
  }
  await found.supabase.from("materials").update({ status: "processing", error: null }).eq("id", found.material.id);
  const result = await ingestMaterial(found.material.id, found.userId);
  return Response.json(result, { status: result.status === "ready" ? 200 : 422 });
}

/** DELETE /api/materials/:id — remove the PDF and its search chunks. */
export async function DELETE(_req: Request, { params }: RouteContext<"/api/materials/[materialId]">) {
  const found = await ownMaterial(params);
  if (!found) return Response.json({ error: "We couldn't find this material in your courses." }, { status: 404 });
  await found.supabase.storage.from(MATERIALS_BUCKET).remove([found.material.file_path]);
  const { error } = await found.supabase.from("materials").delete().eq("id", found.material.id);
  if (error) return Response.json({ error: "We couldn't remove it. Please try again." }, { status: 500 });
  return new Response(null, { status: 204 });
}
