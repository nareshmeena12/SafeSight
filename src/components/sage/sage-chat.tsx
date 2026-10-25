"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ExplainBackCard } from "@/components/learning/explain-back-card";
import { PracticeButton } from "@/components/learning/practice-button";
import { RecapCard, type RecapView } from "@/components/learning/recap-card";
import { RefresherOffer } from "@/components/learning/refresher-offer";
import { LogoMark } from "@/components/logo";
import { FadeUp } from "@/components/motion/fade-up";
import { ModeBadge, type AiMode } from "@/components/product/mode-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SageStage, SageUIMessage } from "@/lib/sage/types";
import { cn } from "@/lib/utils";
import { CareCard } from "./care-card";
import { CitationChips } from "./citation-chips";
import { HintLadder } from "./hint-ladder";
import { Markdown } from "./markdown";

const MAX_CHARS = 4000;
/** A chat with no new message for this long gets a recap ("What you learned"). */
const IDLE_RECAP_MS = 10 * 60 * 1000;

type Starters = Record<AiMode | "explore", string[]>;
const starters: Starters = {
  learn: ["I'm stuck on the first problem", "What's the key idea behind this assignment?", "Can you check my working?"],
  assist: ["Explain the main concept to me", "How should I structure this?", "Can you give me feedback on my draft?"],
  exam: [],
  explore: ["Explain this week's topic simply", "Quiz me with one question", "What's the intuition behind entropy?"],
};

const stageText: Record<SageStage, string> = {
  reading: "Thinking…",
  writing: "Thinking…",
  checking: "Checking my hint…",
};

/** An assignment chat, or Explore ("Ask Sage") for a course. */
export type SageChatTarget =
  | { kind: "assignment"; assignmentId: string; title: string; mode: AiMode }
  | { kind: "explore"; courseId: string; courseName: string };

export function SageChat({
  target,
  studentFirstName,
  initialConversationId,
  initialMessages,
  available,
  preview = false,
}: {
  target: SageChatTarget;
  studentFirstName: string;
  initialConversationId: string | null;
  initialMessages: SageUIMessage[];
  /** False when the model provider isn't configured yet. */
  available: boolean;
  /** A teacher's "Preview Sage": same replies, nothing counted (/api/sage/preview). */
  preview?: boolean;
}) {
  const mode: AiMode | "explore" = target.kind === "assignment" ? target.mode : "explore";
  const targetKey = target.kind === "assignment" ? target.assignmentId : target.courseId;
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [transport] = useState(
    () =>
      new DefaultChatTransport<SageUIMessage>({
        api: preview ? "/api/sage/preview" : "/api/sage",
        // The server keeps the history; send only the new message. Its id is
        // the idempotency key: a retry of the same message is answered once.
        prepareSendMessagesRequest: ({ messages, body }) => {
          const last = messages.findLast((m) => m.role === "user") ?? messages[messages.length - 1];
          const text = last.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          return {
            body: {
              ...(target.kind === "assignment" ? { assignmentId: target.assignmentId } : { courseId: target.courseId }),
              conversationId: (body as { conversationId?: string | null } | undefined)?.conversationId ?? null,
              message: { id: last.id, text },
            },
          };
        },
      }),
  );

  const [stage, setStage] = useState<SageStage | null>(null);
  const { messages, sendMessage, regenerate, status, error, stop, setMessages, clearError } = useChat<SageUIMessage>({
    id: initialConversationId ?? `new-${targetKey}`,
    messages: initialMessages,
    transport,
    onData: (part) => {
      if (part.type === "data-status") setStage(part.data.stage);
    },
    onFinish: ({ message }) => {
      setStage(null);
      if (message.metadata?.conversationId) setConversationId(message.metadata.conversationId);
    },
    onError: () => setStage(null),
  });

  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const disabled = !available || busy;
  // useChat's status changes on the next render; this blocks a second Enter in the same tick.
  const sending = useRef(false);
  useEffect(() => {
    if (!busy) sending.current = false;
  }, [busy]);
  const lastMessage = messages.at(-1);
  const waiting =
    busy && (status === "submitted" || !lastMessage || lastMessage.role === "user" || !lastMessage.parts.some((p) => p.type === "text" && p.text));

  const hintLevel =
    messages.findLast((m) => m.role === "assistant" && m.metadata?.hintLevel)?.metadata?.hintLevel ?? null;
  // "Practice this" sits under the latest free explanation only.
  const practiceId = messages.findLast((m) => m.role === "assistant" && m.metadata?.practice)?.id ?? null;
  const exploreCourseId = target.kind === "explore" ? target.courseId : null;

  // Session recap: when the chat goes idle, on New chat, and when the student leaves.
  const [recap, setRecap] = useState<RecapView | null>(null);
  const studentMessages = messages.filter((m) => m.role === "user").length;
  const recapState = useRef({ conversationId, studentMessages, sentAt: 0 });
  useEffect(() => {
    recapState.current.conversationId = conversationId;
    recapState.current.studentMessages = studentMessages;
  }, [conversationId, studentMessages]);
  // Teacher previews aren't real chats: no recaps.
  const recapsOn = mode !== "exam" && available && !preview;

  function sendRecap(reason: "new_chat" | "idle" | "leave", beacon = false) {
    const s = recapState.current;
    if (!recapsOn || !s.conversationId || s.studentMessages - s.sentAt < 2) return null;
    recapState.current.sentAt = s.studentMessages;
    const body = JSON.stringify({ conversationId: s.conversationId, reason });
    if (beacon && navigator.sendBeacon?.("/api/learning/recap", new Blob([body], { type: "application/json" }))) return null;
    return fetch("/api/learning/recap", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true })
      .then((r) => (r.ok ? (r.json() as Promise<{ recap: RecapView | null }>) : null))
      .catch(() => null);
  }

  useEffect(() => {
    if (busy || !recapsOn || !conversationId) return;
    const timer = setTimeout(() => {
      void sendRecap("idle")?.then((r) => {
        if (r?.recap) setRecap(r.recap);
      });
    }, IDLE_RECAP_MS);
    return () => clearTimeout(timer);
    // sendRecap reads the latest state from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, conversationId, studentMessages, recapsOn]);

  useEffect(() => {
    const leave = () => void sendRecap("leave", true);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      // Leaving the chat inside the app (no pagehide).
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, status]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending.current) return;
    sending.current = true;
    clearError();
    setStage("reading");
    void sendMessage({ text: trimmed.slice(0, MAX_CHARS) }, { body: { conversationId } });
    setInput("");
  }

  const targetQuery =
    target.kind === "assignment" ? `assignmentId=${target.assignmentId}` : `courseId=${target.courseId}`;

  async function newChat() {
    void sendRecap("new_chat");
    recapState.current.sentAt = 0;
    setRecap(null);
    stop();
    // A preview's chat and hint ladder live on the server: clear them first.
    if (preview) await fetch(`/api/sage/preview?${targetQuery}`, { method: "DELETE" }).catch(() => {});
    setConversationId(null);
    setMessages([]);
    clearError();
    setStage(null);
  }

  /**
   * Send the same message again, with the same id: if Sage already answered
   * it, the server sends that answer back instead of a second one.
   */
  function retry() {
    if (sending.current) return;
    sending.current = true;
    clearError();
    setStage("reading");
    void regenerate({ body: { conversationId } });
  }

  return (
    <div className="flex flex-col">
      <div className="mb-6 flex flex-col gap-3 rounded-lg border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {target.kind === "assignment" ? (
            <>
              <ModeBadge mode={target.mode} withHint />
              {target.mode !== "exam" ? <HintLadder level={hintLevel} /> : null}
            </>
          ) : (
            <p className="text-small text-muted-foreground">
              Ask about anything in <span className="text-foreground">{target.courseName}</span>. If a question is part of an
              assignment, Sage follows that assignment&apos;s rule.
            </p>
          )}
        </div>
        {messages.length ? (
          <Button variant="ghost" onClick={() => void newChat()} className="self-start sm:self-auto">
            <RotateCcw aria-hidden="true" />
            New chat
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 pb-4" role="log" aria-label="Chat with Sage" aria-live="polite" aria-busy={busy}>
        {messages.length === 0 ? (
          <SageBubble>
            <p className="mb-3">
              {target.kind === "explore" ? (
                <>
                  Hi{studentFirstName ? ` ${studentFirstName}` : ""}! I&apos;m Sage. Ask me about any idea from{" "}
                  <strong>{target.courseName}</strong> — I&apos;ll explain it properly and check you&apos;ve got it.
                </>
              ) : target.mode === "exam" ? (
                <>
                  <strong>{target.title}</strong> is in Exam mode, so I&apos;m switched off for it. Good luck — I&apos;ll be
                  here to help you revise afterwards.
                </>
              ) : (
                <>
                  Hi{studentFirstName ? ` ${studentFirstName}` : ""}! I&apos;m Sage. Let&apos;s work through{" "}
                  <strong>{target.title}</strong> together. Tell me which part you&apos;re on and what you&apos;ve tried
                  so far — I&apos;ll help you find the next step yourself.
                </>
              )}
            </p>
            {available && starters[mode].length ? (
              <div className="flex flex-wrap gap-2">
                {starters[mode].map((s) => (
                  <Button key={s} variant="secondary" size="sm" onClick={() => send(s)} className="h-auto min-h-11 py-2 whitespace-normal sm:min-h-9">
                    {s}
                  </Button>
                ))}
              </div>
            ) : null}
          </SageBubble>
        ) : null}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <StudentBubble key={m.id} message={m} />
          ) : (
            <SageMessage
              key={m.id}
              message={m}
              thinking={busy && i === messages.length - 1 && waiting ? stageText[stage ?? "reading"] : null}
              tools={
                busy && i === messages.length - 1 ? null : (
                  <LearningTools
                    message={m}
                    courseId={m.metadata?.courseId ?? exploreCourseId}
                    conversationId={conversationId}
                    showPractice={m.id === practiceId}
                  />
                )
              }
            />
          ),
        )}

        {waiting && status === "submitted" ? (
          <SageBubble>
            <Thinking label={stageText[stage ?? "reading"]} />
          </SageBubble>
        ) : null}

        {recap ? (
          <SageBubble>
            <p className="mb-3 text-small text-muted-foreground">Here&apos;s a quick recap of this chat — it&apos;s saved in My learning.</p>
            <RecapCard recap={recap} />
          </SageBubble>
        ) : null}

        {error ? (
          <div role="alert" className="flex flex-col gap-3 rounded-md border bg-surface p-4 text-small sm:flex-row sm:items-center sm:justify-between">
            <p>{friendlyError(error)}</p>
            <Button variant="secondary" onClick={retry} disabled={!available} className="self-start sm:shrink-0">
              <RotateCcw aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 -mx-4 border-t bg-background/90 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:mx-0 sm:rounded-lg sm:border sm:px-3 sm:pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="sage-input" className="sr-only">
          Message Sage
        </label>
        <div className="flex items-end gap-2">
          <Textarea
            id="sage-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            maxLength={MAX_CHARS}
            rows={1}
            placeholder={
              !available
                ? "Sage is being set up — check back soon"
                : mode === "exam"
                  ? "Sage is off for this assignment"
                  : mode === "explore"
                    ? "Ask Sage about anything in this course…"
                  : "Ask Sage, or share what you've tried…"
            }
            disabled={!available}
            aria-describedby="sage-privacy"
            className="max-h-48 min-h-11 resize-none py-2.5"
          />
          {busy ? (
            <Button type="button" size="icon" variant="secondary" onClick={() => stop()} aria-label="Stop Sage's reply">
              <Square aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={disabled || !input.trim()} aria-label="Send message">
              <ArrowUp aria-hidden="true" />
            </Button>
          )}
        </div>
        <p className="mt-2 flex justify-between gap-4 text-small text-muted-foreground">
          <span id="sage-privacy">
            {preview
              ? "Preview: replies follow the same rules students get. Nothing here is flagged or counted in your class numbers."
              : "Your teacher sees a summary, not your chats — unless a message is flagged or you share it."}
          </span>
          {input.length > MAX_CHARS - 500 ? (
            <span className="shrink-0 font-mono">
              {input.length}/{MAX_CHARS}
            </span>
          ) : null}
        </p>
      </form>
    </div>
  );
}

function friendlyError(error: Error) {
  const message = error.message?.trim();
  const network = /failed to fetch|networkerror|load failed|network request failed|aborted/i.test(message ?? "");
  if (!message || network || message.startsWith("{") || message.startsWith("<") || message.length > 300) {
    return "Sage couldn't reply just now. Check your connection and try again.";
  }
  return message;
}

function SageBubble({ children }: { children: React.ReactNode }) {
  return (
    <FadeUp className="flex max-w-[44rem] gap-3">
      <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full border bg-surface">
        <LogoMark className="size-5" />
      </span>
      <div className="min-w-0 flex-1 rounded-lg rounded-tl-sm border bg-surface px-4 py-3">{children}</div>
    </FadeUp>
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-muted-foreground" role="status">
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
        <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse [animation-delay:150ms]" />
        <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse [animation-delay:300ms]" />
      </span>
      <span className="text-small">{label}</span>
    </p>
  );
}

/** Practice this / Explain it back / a refresher offer, as decided by the server for this reply. */
function LearningTools({
  message,
  courseId,
  conversationId,
  showPractice,
}: {
  message: SageUIMessage;
  courseId: string | null;
  conversationId: string | null;
  showPractice: boolean;
}) {
  const meta = message.metadata;
  if (!courseId || !meta) return null;
  return (
    <>
      {meta.refresher ? <RefresherOffer courseId={courseId} topic={meta.refresher.topic} /> : null}
      {meta.explainBack ? <ExplainBackCard courseId={courseId} conversationId={conversationId} topic={meta.explainBack.topic} /> : null}
      {showPractice && meta.practice ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <PracticeButton courseId={courseId} topic={meta.practice.topic} source="explore" size="sm" />
          <span className="text-small text-muted-foreground">3 new problems on {meta.practice.topic}, easy to hard</span>
        </div>
      ) : null}
    </>
  );
}

function SageMessage({ message, thinking, tools }: { message: SageUIMessage; thinking: string | null; tools?: React.ReactNode }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  const care = message.parts.find((p) => p.type === "data-care");
  const rules = message.metadata?.rules;
  // A reply that was stopped or failed before any text: nothing to show.
  if (!text && !care && !thinking) return null;
  return (
    <SageBubble>
      <span className="sr-only">Sage said:</span>
      {care?.type === "data-care" ? <CareCard care={care.data} /> : null}
      {text ? <Markdown>{text}</Markdown> : null}
      {thinking && !text ? <Thinking label={thinking} /> : null}
      {rules ? (
        <p className="mt-2 text-small text-muted-foreground">
          This looks like part of <span className="text-foreground">{rules.title}</span>, so Sage followed its{" "}
          {rules.mode === "learn" ? "Learn (hints only)" : rules.mode === "assist" ? "Assist" : "Exam"} rule.
        </p>
      ) : null}
      <CitationChips citations={message.metadata?.citations ?? []} />
      {text ? tools : null}
    </SageBubble>
  );
}

function StudentBubble({ message }: { message: SageUIMessage }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  return (
    <FadeUp className="ml-auto max-w-[85%] sm:max-w-[36rem]">
      <span className="sr-only">You said:</span>
      <p className={cn("rounded-lg rounded-tr-sm bg-primary-soft px-4 py-3 whitespace-pre-wrap break-words")}>{text}</p>
    </FadeUp>
  );
}
