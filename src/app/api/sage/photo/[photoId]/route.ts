import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { removePhotoImages, signedPhotoUrl } from "@/lib/photos/data";
import { photoExpired } from "@/lib/photos/transcript";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/sage/photo/:id — the image, through a 60-second signed link. The
 * row is read under row-level security: the student who took it, or their
 * teacher once the chat is flagged or shared. Expired images are never served.
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/sage/photo/[photoId]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in to see this photo.", { status: 401 });
  const { photoId } = await params;
  if (!z.uuid().safeParse(photoId).success) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("sage_photos")
    .select("storage_path, created_at, sent_at, deleted_at")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return new Response("We couldn't find this photo.", { status: 404 });
  if (photo.deleted_at || !photo.storage_path || photoExpired({ createdAt: photo.created_at, sentAt: photo.sent_at })) {
    return new Response("This photo was removed after 30 days.", { status: 410 });
  }
  const url = await signedPhotoUrl(photo.storage_path);
  if (!url) return new Response("We couldn't open this photo right now.", { status: 502 });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
}

/** DELETE /api/sage/photo/:id — the student cancelled before sending: remove the image now. */
export async function DELETE(_req: Request, { params }: RouteContext<"/api/sage/photo/[photoId]">) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { photoId } = await params;
  if (!z.uuid().safeParse(photoId).success) return new Response(null, { status: 404 });

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("sage_photos")
    .select("id, storage_path, status, student_id")
    .eq("id", photoId)
    .eq("student_id", user.id)
    .maybeSingle();
  // Only unsent photos: a sent one is part of the chat (and goes after 30 days).
  if (!photo || photo.status === "sent") return new Response(null, { status: 404 });
  try {
    await removePhotoImages([photo]);
  } catch (error) {
    console.error("sage photo delete:", error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
