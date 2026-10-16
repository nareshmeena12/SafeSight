import { after } from "next/server";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  tool,
  type ModelMessage,
  type UIMessageStreamWriter,
} from "ai";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { aiStatus, chatModel } from "@/lib/ai/provider";
import { searchCourseMaterial } from "@/lib/materials/search";
import { careData } from "@/lib/sage/care";
import { classifyMessage } from "@/lib/sage/classify";
import {
  checkRateLimit,
  courseHasMaterials,
  getAssignmentPolicy,
  getStudentProgress,
  labelStudentMessage,
  logSageReply,
  logStudentMessage,
  raiseFlags,
  recentOpenFlags,
  resolveConversation,
} from "@/lib/sage/data";
import { decideFlags } from "@/lib/sage/flags";
import { nextHintLevel } from "@/lib/sage/ladder";
import { heuristicLabels } from "@/lib/sage/labels";
import { buildSagePrompt, examModeReply } from "@/lib/sage/prompt";
import { SEARCH_TOOL, sageRequestSchema, type Citation, type SageUIMessage } from "@/lib/sage/types";
import { createClient } from "@/lib/supabase/server";
import { refreshCurrentWeek } from "@/lib/teacher/refresh";

export const maxDuration = 60;

/** Cited pages shown under a reply, per notes search. */
const CHIPS_PER_SEARCH = 2;

/** Friendly plain-text errors: useChat shows the body as the error message. */
function reply(status: number, message: string) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/**
 * POST /api/sage — one student turn. Every model call happens here, never in
 * the browser. Steps: check who is asking and the assignment's rule, rate
 * limit, log the message, classify it, pick the hint-ladder step, raise
 * flags, then stream Sage's reply and save it.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return reply(401, "Please sign in again to keep chatting with Sage.");
  if (user.role !== "student") return reply(403, "Sage chats are for students.");

  const parsed = sageRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return reply(400, parsed.error.issues[0]?.message ?? "That message didn't come through. Please try again.");
  }
  const { assignmentId, conversationId: requestedConversation, message } = parsed.data;

  const supabase = await createClient();
  const policy = await getAssignmentPolicy(supabase, assignmentId);
  if (!policy) return reply(404, "We couldn't find this assignment in your courses.");
  if (policy.mode !== "exam" && !aiStatus().chat) {
    return reply(503, "Sage isn't switched on yet. The SafeSight team is finishing the setup — please check back soon.");
  }

  const rate = await checkRateLimit(user.id);
  if (!rate.allowed) {
    return reply(
      429,
      `You've sent ${rate.limit} messages in the last hour — that's a lot of thinking! Take a short break; you can carry on in about ${rate.retryAfterMinutes} minute${rate.retryAfterMinutes === 1 ? "" : "s"}.`,
    );
  }

  const conversationId = await resolveConversation(supabase, {
    studentId: user.id,
    assignmentId,
    conversationId: requestedConversation,
  });
  if (!conversationId) return reply(403, "This chat belongs to another assignment. Please reload the page.");

  const progress = await getStudentProgress(conversationId);
  const messageId = await logStudentMessage(conversationId, message.text);
  const replyId = crypto.randomUUID();
  const care = careData();

  const labels =
    policy.mode === "exam"
      ? heuristicLabels(message.text)
      : await classifyMessage({ text: message.text, history: progress.history, mode: policy.mode });
  const hintLevel = nextHintLevel({ mode: policy.mode, current: progress.currentLevel, labels });
  const decisions = decideFlags({
    mode: policy.mode,
    labels,
    recentIntents: [...progress.recentIntents, labels.intent],
    recentOverrides: progress.overrides,
    assignmentTitle: policy.title,
    existing: await recentOpenFlags(user.id, policy.course.id),
  });
  await Promise.all([
    labelStudentMessage(messageId, labels),
    raiseFlags({ studentId: user.id, courseId: policy.course.id, messageId, decisions }),
  ]);
  // Keep this week's Reliance Score current for the teacher's dashboard.
  after(() => refreshCurrentWeek(policy.course.id));

  const showCare = labels.distress !== "none" || labels.intent === "distress";
  const startMessage = (writer: UIMessageStreamWriter<SageUIMessage>) => {
    writer.write({ type: "start", messageId: replyId, messageMetadata: { conversationId, hintLevel } });
    if (showCare) writer.write({ type: "data-care", id: "care", data: care });
  };

  // Exam mode: Sage is off. A fixed, kind reply; no model call.
  if (policy.mode === "exam") {
    const text = examModeReply(policy.title);
    await logSageReply({ id: replyId, conversationId, content: text, hintLevel: null, citations: [] });
    const stream = createUIMessageStream<SageUIMessage>({
      execute: ({ writer }) => {
        startMessage(writer);
        writer.write({ type: "text-start", id: "exam" });
        writer.write({ type: "text-delta", id: "exam", delta: text });
        writer.write({ type: "text-end", id: "exam" });
        writer.write({ type: "finish", messageMetadata: { conversationId, hintLevel: null, citations: [] } });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  const hasMaterials = await courseHasMaterials(policy.course.id);
  const citations: Citation[] = [];
  const tools = hasMaterials
    ? {
        [SEARCH_TOOL]: tool({
          description:
            "Search the teacher's uploaded notes and PDFs for this course. Returns passages with their page numbers.",
          inputSchema: z.object({
            query: z.string().min(2).max(300).describe("What to look for, in a few words"),
          }),
          execute: async ({ query }) => {
            const passages = await searchCourseMaterial(policy.course.id, query);
            // Chips show the best matches only; the model still reads all passages.
            for (const p of passages.slice(0, CHIPS_PER_SEARCH)) {
              if (!citations.some((c) => c.materialId === p.materialId && c.page === p.page)) {
                citations.push({ materialId: p.materialId, title: p.title, page: p.page });
              }
            }
            return passages.length
              ? passages.map(({ title, page, content }) => ({ title, page, content }))
              : "No matching passages in the course notes.";
          },
        }),
      }
    : undefined;

  const system = buildSagePrompt({
    mode: policy.mode,
    courseName: policy.course.name,
    courseCode: policy.course.code,
    assignmentTitle: policy.title,
    instructions: policy.instructions,
    teacherNotes: policy.teacherNotes,
    hintLevel,
    labels,
    studentFirstName: user.fullName.split(" ")[0] ?? "",
    hasMaterials,
    care,
  });
  const messages: ModelMessage[] = [...progress.history, { role: "user", content: message.text }];

  // Save the reply even if the student closes the tab mid-stream.
  let markSaved = () => {};
  const saved = new Promise<void>((resolve) => (markSaved = resolve));
  after(() => Promise.race([saved, new Promise((r) => setTimeout(r, (maxDuration - 5) * 1000))]));
  const save = async (text: string) => {
    try {
      await logSageReply({ id: replyId, conversationId, content: text.trim(), hintLevel, citations: citations.slice(0, 3) });
    } finally {
      markSaved();
    }
  };

  const stream = createUIMessageStream<SageUIMessage>({
    execute: ({ writer }) => {
      startMessage(writer);
      const result = streamText({
        model: chatModel(),
        system,
        messages,
        tools,
        stopWhen: isStepCount(3),
        temperature: 0.4,
        maxRetries: 1,
        onEnd: ({ steps }) => save(steps.map((s) => s.text).join("\n\n")),
        onAbort: ({ steps }) => save(steps.map((s) => s.text).join("\n\n")),
        onError: ({ error }) => {
          console.error("sage stream:", error);
          markSaved();
        },
      });
      result.consumeStream();
      writer.merge(
        toUIMessageStream<NonNullable<typeof tools>, SageUIMessage>({
          stream: result.stream,
          sendStart: false,
          messageMetadata: ({ part }) =>
            part.type === "finish" ? { conversationId, hintLevel, citations: citations.slice(0, 3) } : undefined,
        }),
      );
    },
    onError: (error) => {
      console.error("sage:", error);
      markSaved();
      return "Sage couldn't finish that reply. Please try again in a moment.";
    },
  });
  return createUIMessageStreamResponse({ stream });
}
