import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanupCutoffs, type PhotoMimeType } from "./transcript";

/**
 * S21 photo of working: storage and rows. Images live in the private
 * `sage-photos` bucket at `<student>/<photo>.<ext>`; no browser reads or
 * writes it (no Storage policies), so every call here uses the service role
 * after the route has checked the user under RLS.
 */

export const PHOTOS_BUCKET = "sage-photos";

const ext: Record<PhotoMimeType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Uploads a readable photo and saves its transcription. Returns the new photo id. */
export async function storePhoto({
  studentId,
  courseId,
  assignmentId,
  bytes,
  mimeType,
  lines,
  note,
}: {
  studentId: string;
  courseId: string;
  assignmentId: string | null;
  bytes: Uint8Array;
  mimeType: PhotoMimeType;
  lines: string[];
  note: string;
}): Promise<string> {
  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const path = `${studentId}/${id}.${ext[mimeType]}`;
  const { error: uploadError } = await admin.storage
    .from(PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false, cacheControl: "0" });
  if (uploadError) throw new Error(`photo upload: ${uploadError.message}`);
  const { error } = await admin.from("sage_photos").insert({
    id,
    student_id: studentId,
    course_id: courseId,
    assignment_id: assignmentId,
    storage_path: path,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
    lines,
    note,
    status: "transcribed",
  });
  if (error) {
    await admin.storage.from(PHOTOS_BUCKET).remove([path]);
    throw new Error(`photo row: ${error.message}`);
  }
  return id;
}

/** A photo the student may send in this course now: theirs, not sent yet, not removed. */
export async function readSendablePhoto(studentId: string, photoId: string, courseId: string) {
  const { data } = await createAdminClient()
    .from("sage_photos")
    .select("id, status")
    .eq("id", photoId)
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .maybeSingle();
  // A retry of the same message finds it already "sent" to this message; that's fine too.
  return data && (data.status === "transcribed" || data.status === "sent") ? data : null;
}

/** Links the photo to the message it was sent with (after the message is saved). */
export async function attachPhoto({
  photoId,
  studentId,
  conversationId,
  messageId,
}: {
  photoId: string;
  studentId: string;
  conversationId: string;
  messageId: string;
}) {
  const { error } = await createAdminClient()
    .from("sage_photos")
    .update({ conversation_id: conversationId, message_id: messageId, status: "sent", sent_at: new Date().toISOString() })
    .eq("id", photoId)
    .eq("student_id", studentId)
    .eq("status", "transcribed");
  if (error) throw new Error(`attach photo: ${error.message}`);
}

/** Removes the image now (the student cancelled, or it expired). The row stays as a record. */
export async function removePhotoImages(photos: { id: string; storage_path: string | null }[]) {
  if (!photos.length) return 0;
  const admin = createAdminClient();
  const paths = photos.map((p) => p.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length) {
    const { error } = await admin.storage.from(PHOTOS_BUCKET).remove(paths);
    if (error) throw new Error(`photo remove: ${error.message}`);
  }
  const { error } = await admin
    .from("sage_photos")
    .update({ deleted_at: new Date().toISOString(), storage_path: null, lines: [] })
    .in(
      "id",
      photos.map((p) => p.id),
    );
  if (error) throw new Error(`photo rows: ${error.message}`);
  return photos.length;
}

/**
 * The nightly clean-up: images sent to Sage are removed 30 days after upload,
 * photos that were never sent after a day. Runs in batches; returns how many
 * were removed.
 */
export async function purgeExpiredPhotos(now = Date.now()) {
  const admin = createAdminClient();
  const cut = cleanupCutoffs(now);
  let removed = 0;
  for (let round = 0; round < 20; round++) {
    const { data, error } = await admin
      .from("sage_photos")
      .select("id, storage_path")
      .is("deleted_at", null)
      .or(`and(sent_at.not.is.null,created_at.lt.${cut.sent}),and(sent_at.is.null,created_at.lt.${cut.unsent})`)
      .limit(200);
    if (error) throw new Error(`photo cleanup: ${error.message}`);
    if (!data.length) break;
    removed += await removePhotoImages(data);
    if (data.length < 200) break;
  }
  return removed;
}

/** A 60-second link to the image, or null if it's gone. */
export async function signedPhotoUrl(path: string) {
  const { data, error } = await createAdminClient().storage.from(PHOTOS_BUCKET).createSignedUrl(path, 60);
  return error || !data ? null : data.signedUrl;
}
