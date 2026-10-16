import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { MATERIALS_BUCKET } from "@/lib/materials/constants";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/materials/:id/file?page=12 — opens a course PDF at a page (the
 * citation chips under Sage's replies). Course members only: the material
 * row and the Storage object are both read under row-level security.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/materials/[materialId]/file">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in to open course notes.", { status: 401 });
  const { materialId } = await params;
  if (!z.uuid().safeParse(materialId).success) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: material } = await supabase.from("materials").select("file_path").eq("id", materialId).maybeSingle();
  if (!material) return new Response("We couldn't find these notes in your courses.", { status: 404 });

  const { data, error } = await supabase.storage.from(MATERIALS_BUCKET).createSignedUrl(material.file_path, 60);
  if (error || !data) return new Response("We couldn't open these notes right now.", { status: 502 });

  const page = z.coerce.number().int().positive().max(10_000).safeParse(new URL(req.url).searchParams.get("page"));
  const target = page.success ? `${data.signedUrl}#page=${page.data}` : data.signedUrl;
  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
}
