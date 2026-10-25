import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { getCurrentUser } from "@/lib/auth/dal";
import { aiStatus } from "@/lib/ai/provider";
import { readLearningContext, recordOffer, type LearningContext } from "@/lib/learning/data";
import { logMistakeFromTurn } from "@/lib/learning/mistakes";
import { decideOffers, NO_OFFERS, type LearningOffers } from "@/lib/learning/offers";
import { searchCourseMaterial } from "@/lib/materials/search";
import { careData } from "@/lib/sage/care";
import {
  activeAssignments,
  assignmentWithSecrets,
  checkRateLimit,
  courseHasMaterials,
  createConversation,
  findByClientId,
  labelStudentMessage,
  logSageReply,
  logStudentMessage,
  ownsConversation,
  raiseFlags,
  readAssignmentChat,
  readCourse,
  readHistory,
  readLadderForCourse,
  recentActivity,
  recentOpenFlags,
  saveLadder,
  type Course,
} from "@/lib/sage/data";
import type { Plan, TurnInput } from "@/lib/sage/engine";
import { decideFlags } from "@/lib/sage/flags";
import { sageTurnStream, type TurnOutcome } from "@/lib/sage/turn-stream";
import { citationsSchema, sageRequestSchema, type SageUIMessage } from "@/lib/sage/types";
import { createClient } from "@/lib/supabase/server";
import { refreshCurrentWeek } from "@/lib/teacher/refresh";

/**
 * Worst case: classify (4 s) + draft (≤ 25 s) + guard (6 s) + one regeneration
 * only if ≥ 18 s are left. Vercel stops the function at maxDuration.
 */
export const maxDuration = 60;
const DEADLINE_MS = 55_000;

/** Browser message ids this server instance is answering right now (double-send guard). */
const inFlight = new Set<string>();

/** Friendly plain-text errors: useChat shows the body as the error message. */
function reply(status: number, message: string) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/**
 * POST /api/sage — one student turn. Every model call happens here, never in
 * the browser. Reads run in parallel; classification and notes search run in
 * parallel; logging runs in the background (after()) and never blocks the
 * stream. The reply's text goes out as soon as the output guard allows.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const user = await getCurrentUser();
  if (!user) return reply(401, "Please sign in again to keep chatting with Sage.");
  if (user.role !== "student") return reply(403, "Sage chats are for students.");

  const parsed = sageRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return reply(400, parsed.error.issues[0]?.message ?? "That message didn't come through. Please try again.");
  }
  const { assignmentId, courseId: askedCourseId, conversationId: askedConversation, message } = parsed.data;
  if (inFlight.has(message.id)) return reply(409, "Sage is still answering that message — it'll appear in a moment.");
  // Registered before any await, so a double-send can't slip past it.
  inFlight.add(message.id);
  const done = () => inFlight.delete(message.id);
  let streaming = false;
  try {

    const supabase = await createClient();
    const [chat, rate, existing] = await Promise.all([
      assignmentId
        ? readAssignmentChat(supabase, assignmentId)
        : readCourse(supabase, askedCourseId!).then((course) => (course ? { assignment: null, course } : null)),
      checkRateLimit(user.id),
      findByClientId(user.id, message.id),
    ]);
    if (!chat) return reply(404, assignmentId ? "We couldn't find this assignment in your courses." : "We couldn't find this course in your list.");
    const course: Course = chat.course;

    // A retry of a message Sage already answered: send the same reply again.
    if (existing?.reply) return replayStored(existing.conversationId, existing.reply);

    const examChat = chat.assignment?.ai_mode === "exam";
    if (!examChat && !aiStatus().chat) {
      return reply(503, "Sage isn't switched on yet. The SafeSight team is finishing the setup — please check back soon.");
    }
    if (!existing && !rate.allowed) {
      return reply(
        429,
        `You've sent ${rate.limit} messages in the last hour — that's a lot of thinking! Take a short break; you can carry on in about ${rate.retryAfterMinutes} minute${rate.retryAfterMinutes === 1 ? "" : "s"}.`,
      );
    }

    const isNew = !existing && !askedConversation;
    const conversationId = existing?.conversationId ?? askedConversation ?? crypto.randomUUID();
    const userMessageId = existing?.messageId ?? crypto.randomUUID();

    const [owns, candidates, home, past, activity, openFlags, hasMaterials, ladder, learning] = await Promise.all([
      isNew || existing
        ? true
        : ownsConversation(supabase, { conversationId, studentId: user.id, assignmentId: assignmentId ?? null, courseId: course.id }),
      activeAssignments(course.id),
      chat.assignment ? assignmentWithSecrets(chat.assignment) : null,
      isNew ? { history: [], earlierStudentText: "" } : readHistory(conversationId, userMessageId),
      recentActivity(user.id, course.id),
      recentOpenFlags(user.id, course.id),
      courseHasMaterials(course.id),
      readLadderForCourse(user.id, course.id),
      // The prerequisite check's inputs; Sage still answers if this read fails.
      examChat
        ? null
        : readLearningContext(user.id, course.id).catch((e): LearningContext | null => {
            console.error("sage learning context:", e);
            return null;
          }),
    ]);
    if (!owns) return reply(403, "This chat belongs to another assignment. Please reload the page.");

    // Save the conversation and the student's message in the background.
    const saved = (async () => {
      if (isNew) await createConversation({ id: conversationId, studentId: user.id, assignmentId: assignmentId ?? null, courseId: course.id });
      if (!existing) await logStudentMessage({ id: userMessageId, conversationId, content: message.text, clientId: message.id });
    })();
    saved.catch((e) => console.error("sage log:", e));

    const care = careData();
    const input: TurnInput = {
      text: message.text,
      history: past.history,
      home,
      candidates: home ? [home, ...candidates.filter((c) => c.id !== home.id)] : candidates,
      ladderFor: (id) => ladder.get(id) ?? null,
      course,
      studentFirstName: user.fullName.split(" ")[0] ?? "",
      earlierStudentText: past.earlierStudentText,
      search: hasMaterials
        ? (q) => searchCourseMaterial(course.id, q, { usage: { feature: "sage_notes_search", userId: user.id } })
        : null,
      care,
      jailbreaks: activity.jailbreaks,
      labelsOnly: examChat,
      usage: { userId: user.id, prefix: "sage" },
    };
    const replyId = crypto.randomUUID();
    let offers: LearningOffers = NO_OFFERS;
    const context = home ? home.title : `Ask Sage (${course.code || course.name})`;

    const stream = sageTurnStream({
      input,
      started,
      signal: req.signal,
      deadline: started + DEADLINE_MS,
      replyId,
      conversationId,
      homeId: home?.id ?? null,
      onPlan: saveTurn,
      // The chat must exist before the client can send its next message in it
      // (the text is already out; this only delays the end of the stream).
      beforeFinish: () => saved,
      onDone: saveReply,
      release: done,
      // Practice / Explain it back / a prerequisite refresher, decided in code (never for a fallback reply).
      finishMetadata: (plan, result) => {
        offers =
          result.guard !== "safe_hint" && !examChat
            ? decideOffers({ policy: plan.policy, labels: plan.labels, explore: !home, context: learning })
            : NO_OFFERS;
        return { courseId: course.id, ...offers };
      },
    });
    streaming = true;
    return createUIMessageStreamResponse({ stream });

    /** Labels, ladder state, flags and the dashboard refresh — after the student message is saved. */
    async function saveTurn(plan: Plan) {
      try {
        await saved;
        const { policy, labels } = plan;
        const decisions = decideFlags({
          policy,
          labels,
          recentIntents: [...activity.intents, labels.intent],
          recentJailbreaks: activity.jailbreaks,
          context,
          existing: openFlags,
        });
        await Promise.all([
          labelStudentMessage(userMessageId, labels),
          raiseFlags({ studentId: user!.id, courseId: course.id, messageId: userMessageId, decisions }),
          policy.governing && policy.ladder ? saveLadder(user!.id, policy.governing.id, policy.ladder) : null,
        ]);
        // Keep this week's Reliance Score current for the teacher's dashboard.
        await refreshCurrentWeek(course.id);
      } catch (error) {
        console.error("sage save turn:", error);
      }
    }

    async function saveReply({ plan, text, result, ttft, citations, latency, failed }: TurnOutcome) {
      if (!text.trim()) return;
      // Runs alongside saving the reply; awaited so the background work isn't cut off.
      const learningWork = Promise.all([
        offers.refresher ? recordOffer(user!.id, course.id, offers.refresher.topic) : null,
        // The mistake log: name the error pattern in working Sage just checked.
        !failed && plan.policy.kind === "check_work" && result?.guard !== "safe_hint"
          ? logMistakeFromTurn({ studentId: user!.id, courseId: course.id, working: message.text, reply: text, topic: plan.labels.topic })
          : null,
      ]).catch((e) => console.error("sage learning log:", e));
      try {
        await saved;
        await logSageReply({
          id: replyId,
          conversationId,
          replyTo: userMessageId,
          content: text.trim(),
          hintLevel: plan.policy.step,
          citations,
          ttftMs: ttft,
          latencyMs: latency,
          guard: result?.guard ?? "pass",
        });
      } catch (error) {
        console.error("sage save reply:", error);
      }
      await learningWork;
    }
  } finally {
    // The stream releases it when the reply is done.
    if (!streaming) done();
  }
}

/** Send a reply that was already saved (the student retried a message Sage had answered). */
function replayStored(
  conversationId: string,
  stored: { id: string; content: string; hintLevel: number | null; citations: unknown },
) {
  const citations = citationsSchema.safeParse(stored.citations);
  const stream = createUIMessageStream<SageUIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId: stored.id, messageMetadata: { conversationId, hintLevel: stored.hintLevel } });
      writer.write({ type: "text-start", id: "reply" });
      writer.write({ type: "text-delta", id: "reply", delta: stored.content });
      writer.write({ type: "text-end", id: "reply" });
      writer.write({
        type: "finish",
        messageMetadata: { conversationId, hintLevel: stored.hintLevel, citations: citations.success ? citations.data : [] },
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
