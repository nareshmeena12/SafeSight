import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { aiStatus } from "@/lib/ai/provider";
import { allowAiCall } from "@/lib/ai/usage-log";
import { storePhoto } from "@/lib/photos/data";
import { MAX_PHOTO_BYTES, VISION_CALLS_PER_HOUR, sniffImageType } from "@/lib/photos/transcript";
import { transcribePhoto } from "@/lib/photos/vision";
import { readAssignmentChat, readCourse } from "@/lib/sage/data";
import { createClient } from "@/lib/supabase/server";

/** Two vision attempts of 30 s each, plus the upload. */
export const maxDuration = 75;

const fieldsSchema = z.object({
  courseId: z.uuid().nullish(),
  assignmentId: z.uuid().nullish(),
});

function reply(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * POST /api/sage/photo (multipart: photo, courseId | assignmentId) — reads a
 * photo of handwritten working with the vision model and returns the lines
 * for the student to check. Nothing goes to Sage yet: the student confirms
 * (and can fix) the reading first, then sends it as a normal message with
 * the photo id. Unreadable photos are not kept.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return reply(401, "Please sign in again to send a photo.");
  if (user.role !== "student") return reply(403, "Photos of working are for students' Sage chats.");
  if (!aiStatus().vision) return reply(503, "Photos of working aren't switched on yet. You can type your working instead.");

  const form = await req.formData().catch(() => null);
  if (!form) return reply(400, "That photo didn't come through. Please try again.");
  const fields = fieldsSchema.safeParse({ courseId: form.get("courseId"), assignmentId: form.get("assignmentId") });
  if (!fields.success || !(fields.data.courseId || fields.data.assignmentId)) {
    return reply(400, "Pick a course or an assignment first.");
  }
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return reply(400, "Choose a photo of your working first.");
  if (file.size > MAX_PHOTO_BYTES) return reply(413, "That photo is too large. Try again — we shrink photos before sending.");

  // Row-level security proves the student is in this course.
  const supabase = await createClient();
  const chat = fields.data.assignmentId
    ? await readAssignmentChat(supabase, fields.data.assignmentId)
    : await readCourse(supabase, fields.data.courseId!).then((course) => (course ? { assignment: null, course } : null));
  if (!chat) return reply(404, "We couldn't find this chat in your courses.");
  if (chat.assignment?.ai_mode === "exam") return reply(403, "Sage is off for this assignment, so photos are off too.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImageType(bytes);
  if (!mimeType) return reply(415, "That file doesn't look like a photo. Try a JPG or PNG.");

  if (!(await allowAiCall(user.id, "sage_photo", { limit: VISION_CALLS_PER_HOUR, windowMs: 60 * 60_000 }))) {
    return reply(429, "You've sent a lot of photos this hour. Type your working for now, or try again a bit later.");
  }

  const reading = await transcribePhoto({ bytes, mimeType, userId: user.id });
  if (!reading) return reply(502, "Sage couldn't read that photo just now. Please try again, or type your working.");
  if (!reading.readable) {
    return Response.json({
      readable: false,
      note:
        reading.note ||
        "Sage couldn't make out handwritten working in that photo. Try again in good light, with the page flat and filling the frame.",
    });
  }

  try {
    const photoId = await storePhoto({
      studentId: user.id,
      courseId: chat.course.id,
      assignmentId: chat.assignment?.id ?? null,
      bytes,
      mimeType,
      lines: reading.lines,
      note: reading.note,
    });
    return Response.json({ readable: true, photoId, lines: reading.lines, note: reading.note });
  } catch (error) {
    console.error("sage photo:", error);
    return reply(500, "We couldn't save that photo. Please try again.");
  }
}
