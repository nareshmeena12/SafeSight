import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { aiStatus } from "@/lib/ai/provider";
import { searchCourseMaterial } from "@/lib/materials/search";
import { careData } from "@/lib/sage/care";
import { activeAssignments, assignmentWithSecrets, courseHasMaterials, readTeacherChat } from "@/lib/sage/data";
import type { TurnInput } from "@/lib/sage/engine";
import {
  answeredReply,
  PREVIEW_RATE_PER_HOUR,
  previewHistory,
  previewMessagesLastHour,
  readPreview,
  savePreview,
  type PreviewMessage,
  type PreviewTarget,
} from "@/lib/sage/preview";
import { sageTurnStream, type TurnOutcome } from "@/lib/sage/turn-stream";
import { sageRequestSchema, type SageUIMessage } from "@/lib/sage/types";
import { readCourseNumberSets } from "@/lib/numbers/data";
import { withStudentNumbers } from "@/lib/numbers/numbers";
import { createClient } from "@/lib/supabase/server";

/** Same budget as /api/sage: the preview runs the same pipeline. */
export const maxDuration = 60;
const DEADLINE_MS = 55_000;

const inFlight = new Set<string>();

function reply(status: number, message: string) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

async function teacher() {
  const user = await getCurrentUser();
  if (!user) return { error: reply(401, "Please sign in again.") };
  if (user.role !== "teacher" && user.role !== "admin") return { error: reply(403, "Previewing Sage is for teachers.") };
  return { user };
}

/**
 * POST /api/sage/preview — one turn of "Preview Sage": the teacher sees
 * exactly what a student would get on this assignment (or in Explore for the
 * course): same classifier, policy engine, ladder rules and output guard.
 * Nothing is written to conversations, messages, flags or metrics; the chat
 * and its own hint ladder live in sage_preview_chats.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const auth = await teacher();
  if (auth.error) return auth.error;
  const { user } = auth;

  const parsed = sageRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return reply(400, parsed.error.issues[0]?.message ?? "That message didn't come through. Please try again.");
  }
  const { assignmentId, courseId, message } = parsed.data;
  if (inFlight.has(message.id)) return reply(409, "Sage is still answering that message — it'll appear in a moment.");
  inFlight.add(message.id);
  let streaming = false;
  const done = () => inFlight.delete(message.id);
  try {
    const supabase = await createClient();
    const chat = await readTeacherChat(supabase, user.id, { assignmentId: assignmentId ?? null, courseId: courseId ?? null });
    if (!chat) return reply(404, "We couldn't find this in your courses.");
    const { course } = chat;
    const target: PreviewTarget = { teacherId: user.id, courseId: course.id, assignmentId: chat.assignment?.id ?? null };

    const [preview, sentLastHour, allCandidates, ownHome, hasMaterials, numberSets] = await Promise.all([
      readPreview(target),
      previewMessagesLastHour(user.id),
      activeAssignments(course.id),
      chat.assignment ? assignmentWithSecrets(chat.assignment) : null,
      courseHasMaterials(course.id),
      readCourseNumberSets(course.id),
    ]);
    // S18: the teacher previews with numbers seeded from their own id, like one more student.
    const candidates = withStudentNumbers(allCandidates, numberSets, user.id);
    const home = ownHome ? withStudentNumbers([ownHome], numberSets, user.id)[0] : null;

    const answered = answeredReply(preview, message.id);
    if (answered.reply) return replayStored(answered.reply);

    const examChat = chat.assignment?.ai_mode === "exam";
    if (!examChat && !aiStatus().chat) {
      return reply(503, "Sage isn't connected to its AI model yet, so the preview can't answer. Add the model settings first.");
    }
    if (!answered.asked && sentLastHour >= PREVIEW_RATE_PER_HOUR) {
      return reply(429, `That's ${PREVIEW_RATE_PER_HOUR} preview messages in the last hour — the same limit students have. Please try again a little later.`);
    }

    const past = previewHistory(preview);
    const input: TurnInput = {
      text: message.text,
      history: past.history,
      home,
      candidates: home ? [home, ...candidates.filter((c) => c.id !== home.id)] : candidates,
      ladderFor: (id) => preview.ladder[id] ?? null,
      course,
      studentFirstName: user.fullName.split(" ")[0] ?? "",
      earlierStudentText: past.earlierStudentText,
      search: hasMaterials
        ? (q) => searchCourseMaterial(course.id, q, { usage: { feature: "sage_preview_notes_search", userId: user.id } })
        : null,
      care: careData(),
      jailbreaks: preview.messages.filter((m) => m.intent === "jailbreak").length,
      labelsOnly: examChat,
      usage: { userId: user.id, prefix: "sage_preview" },
    };
    const replyId = crypto.randomUUID();

    const stream = sageTurnStream({
      input,
      started,
      signal: req.signal,
      deadline: started + DEADLINE_MS,
      replyId,
      homeId: home?.id ?? null,
      onDone: save,
      release: done,
      logTag: "sage_preview_turn",
    });
    streaming = true;
    return createUIMessageStreamResponse({ stream });

    /** The turn and the preview's own ladder, in one write. */
    async function save({ plan, text, citations }: TurnOutcome) {
      try {
        const at = new Date().toISOString();
        const messages = [...preview.messages];
        if (!answered.asked) {
          messages.push({
            id: crypto.randomUUID(),
            clientId: message.id,
            role: "user",
            content: message.text,
            at,
            hintLevel: null,
            intent: plan.labels.intent,
            citations: [],
            rules: null,
          });
        }
        if (text.trim()) {
          const g = plan.policy.governing;
          messages.push({
            id: replyId,
            clientId: null,
            role: "assistant",
            content: text.trim(),
            at,
            hintLevel: plan.policy.step,
            intent: null,
            citations,
            rules: g && g.id !== home?.id ? { title: g.title, mode: g.mode } : null,
          } satisfies PreviewMessage);
        }
        const ladder = { ...preview.ladder };
        if (plan.policy.governing && plan.policy.ladder) ladder[plan.policy.governing.id] = plan.policy.ladder;
        await savePreview(target, { ...preview, messages, ladder });
      } catch (error) {
        console.error("sage preview save:", error);
      }
    }
  } finally {
    if (!streaming) done();
  }
}

const resetSchema = z
  .object({ assignmentId: z.uuid().nullish(), courseId: z.uuid().nullish() })
  .refine((b) => Boolean(b.assignmentId || b.courseId));

/** DELETE /api/sage/preview — "New chat": forget this preview and its hint ladder. */
export async function DELETE(req: Request) {
  const auth = await teacher();
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const parsed = resetSchema.safeParse({
    assignmentId: url.searchParams.get("assignmentId"),
    courseId: url.searchParams.get("courseId"),
  });
  if (!parsed.success) return reply(400, "Pick a course or an assignment first.");
  const supabase = await createClient();
  const chat = await readTeacherChat(supabase, auth.user.id, {
    assignmentId: parsed.data.assignmentId ?? null,
    courseId: parsed.data.courseId ?? null,
  });
  if (!chat) return reply(404, "We couldn't find this in your courses.");
  // Row-level security: a teacher deletes only their own preview chats.
  let query = supabase.from("sage_preview_chats").delete().eq("teacher_id", auth.user.id).eq("course_id", chat.course.id);
  query = chat.assignment ? query.eq("assignment_id", chat.assignment.id) : query.is("assignment_id", null);
  const { error } = await query;
  if (error) return reply(500, "We couldn't clear the preview. Please try again.");
  return new Response(null, { status: 204 });
}

function replayStored(stored: PreviewMessage) {
  const stream = createUIMessageStream<SageUIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId: stored.id, messageMetadata: { hintLevel: stored.hintLevel } });
      writer.write({ type: "text-start", id: "reply" });
      writer.write({ type: "text-delta", id: "reply", delta: stored.content });
      writer.write({ type: "text-end", id: "reply" });
      writer.write({
        type: "finish",
        messageMetadata: { hintLevel: stored.hintLevel, citations: stored.citations, rules: stored.rules },
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
