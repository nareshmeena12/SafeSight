import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { lensModel } from "@/lib/lens/model";
import { lensInstructions } from "@/lib/lens/prompt";
import { allowLensRequest } from "@/lib/lens/rate-limit";
import { createLensTools } from "@/lib/lens/tools";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const bodySchema = z.object({
  messages: z.array(z.unknown()).min(1).max(60),
  courseId: z.uuid().nullish(),
});

function problem(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * Lens chat. Teachers only; every tool reads through the teacher's own
 * Supabase client (row-level security) and is limited to their courses.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return problem(401, "Please log in again.");
  if (user.role !== "teacher" && user.role !== "admin") return problem(403, "Lens is for teachers.");
  if (!allowLensRequest(user.id)) {
    return problem(429, "You've asked Lens a lot in a short time. Please wait a minute and try again.");
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, "That request didn't look right. Please try again.");

  const model = lensModel(user.id);
  if (!model) return problem(503, "Lens isn't connected to its AI model yet. Ask your admin to add the model settings.");

  const db = await createClient();
  const tools = createLensTools(db, user.id, parsed.data.courseId ?? null);
  const validated = await safeValidateUIMessages<UIMessage>({ messages: parsed.data.messages, tools });
  if (!validated.success) return problem(400, "That conversation couldn't be read. Please start a new one.");

  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  const result = streamText({
    model,
    instructions: lensInstructions({ teacherName: user.fullName, today }),
    messages: await convertToModelMessages(validated.data, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(6),
    temperature: 0.3,
    abortSignal: request.signal,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: validated.data,
      onError: (error) => {
        console.error("Lens error", error);
        return "Lens couldn't finish that answer. Please try again in a moment.";
      },
    }),
  });
}
