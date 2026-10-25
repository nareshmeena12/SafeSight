import "server-only";
import { after } from "next/server";
import { createUIMessageStream, type UIMessageStreamWriter } from "ai";
import { careReply } from "./care";
import { planTurn, writeReply, type Plan, type Reply, type TurnInput } from "./engine";
import type { Citation, SageStage, SageUIMessage } from "./types";

export type TurnOutcome = {
  plan: Plan;
  /** What the student saw (partial if the reply failed or was stopped). */
  text: string;
  result: Reply | null;
  ttft: number | null;
  citations: Citation[];
  latency: number;
  failed: boolean;
};

/**
 * One Sage turn as a UI message stream: plan (classify ∥ notes) → reply →
 * guard, with "Thinking…" stages, the care card, time-to-first-token and a
 * `sage_turn` log line. Shared by /api/sage (students) and
 * /api/sage/preview (teachers); the callers decide what is saved.
 */
export function sageTurnStream({
  input,
  started,
  signal,
  deadline,
  replyId,
  conversationId,
  homeId,
  onPlan,
  beforeFinish,
  onDone,
  release,
  logTag = "sage_turn",
}: {
  input: TurnInput;
  started: number;
  signal: AbortSignal;
  deadline: number;
  replyId: string;
  conversationId?: string;
  homeId: string | null;
  /** Runs in the background once the policy is decided (labels, flags, ladder). */
  onPlan?: (plan: Plan) => Promise<void> | void;
  /** Awaited before the finish part (e.g. the conversation must exist first). */
  beforeFinish?: () => Promise<unknown>;
  /** Runs in the background with what was sent (save the reply). */
  onDone: (outcome: TurnOutcome) => Promise<void> | void;
  /** Called exactly once when the turn is over, however it ended. */
  release: () => void;
  logTag?: string;
}) {
  let released = false;
  const done = () => {
    if (released) return;
    released = true;
    release();
  };

  return createUIMessageStream<SageUIMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageId: replyId, messageMetadata: { conversationId, hintLevel: null } });
      status(writer, "reading");

      const plan = await planTurn(input, signal);
      const timings = { ...plan.timings, planMs: Date.now() - started };
      if (onPlan) after(() => onPlan(plan));

      if (plan.policy.kind === "care") writer.write({ type: "data-care", id: "care", data: input.care });

      let text = "";
      let ttft: number | null = null;
      const emit = (delta: string) => {
        if (!delta) return;
        if (ttft === null) {
          ttft = Date.now() - started;
          writer.write({ type: "text-start", id: "reply" });
        }
        text += delta;
        writer.write({ type: "text-delta", id: "reply", delta });
      };

      let result: Reply | null = null;
      try {
        result = await writeReply(plan, input, { signal, emit, stage: (s) => status(writer, s), deadline });
      } catch (error) {
        // Wellbeing replies never fail: fall back to a fixed, caring reply.
        if (plan.policy.kind === "care" && !signal.aborted) {
          emit(careReply(input.care));
        } else {
          const outcome = { plan, text, result: null, ttft, citations: [], latency: Date.now() - started, failed: true };
          after(() => onDone(outcome));
          done();
          throw error;
        }
      }
      if (ttft !== null) writer.write({ type: "text-end", id: "reply" });

      await beforeFinish?.().catch(() => {});
      const citations: Citation[] = (result?.cited ?? []).map((p) => ({ materialId: p.materialId, title: p.title, page: p.page }));
      const g = plan.policy.governing;
      writer.write({
        type: "finish",
        messageMetadata: {
          conversationId,
          hintLevel: plan.policy.step,
          citations,
          rules: g && g.id !== homeId ? { title: g.title, mode: g.mode } : null,
        },
      });

      const latency = Date.now() - started;
      console.info(
        JSON.stringify({
          event: logTag,
          kind: plan.policy.kind,
          step: plan.policy.step,
          intent: plan.labels.intent,
          labels: plan.labels.source,
          guard: result?.guard ?? "fixed",
          rejected: result?.rejected.length ?? 0,
          ttftMs: ttft,
          latencyMs: latency,
          ...timings,
          ...(result?.timings ?? {}),
        }),
      );
      const outcome = { plan, text, result, ttft, citations, latency, failed: false };
      after(() => onDone(outcome));
      done();
    },
    onError: (error) => {
      done();
      if (signal.aborted) return "Stopped.";
      console.error(`${logTag}:`, error);
      return "Sage couldn't finish that reply. Please try again in a moment.";
    },
  });
}

function status(writer: UIMessageStreamWriter<SageUIMessage>, stage: SageStage) {
  writer.write({ type: "data-status", data: { stage }, transient: true });
}
