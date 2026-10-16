"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, ListChecks, Mail, RotateCcw, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { lensActions, lensSuggestions } from "./suggestions";
import { ToolView, type LensMessage } from "./tool-views";

/** Turn a failed request into the plain sentence the API sent, if any. */
function friendlyError(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // Not JSON: fall through.
  }
  return "Lens couldn't answer just now. Please try again in a moment.";
}

/**
 * The Lens chat: plain-English questions in, short answers out, with tables,
 * charts and drafts drawn from tool results. Nothing here is saved; a reload
 * starts a fresh conversation.
 */
export function LensChat({ courseId, initialQuestion }: { courseId: string | null; initialQuestion?: string }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat<LensMessage>({
    transport: new DefaultChatTransport({ api: "/api/lens" }),
  });
  const busy = status === "submitted" || status === "streaming";
  const sentInitial = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    clearError();
    void sendMessage({ text: q }, { body: { courseId } });
    setInput("");
  }

  useEffect(() => {
    if (initialQuestion && !sentInitial.current) {
      sentInitial.current = true;
      void sendMessage({ text: initialQuestion }, { body: { courseId } });
    }
  }, [initialQuestion, courseId, sendMessage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, status]);

  const last = messages.at(-1);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      {messages.length === 0 ? (
        <div className="rounded-lg border bg-surface p-6">
          <span className="mb-4 grid size-10 place-items-center rounded-full bg-primary-soft text-primary">
            <Sparkles className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h2 className="text-title">Ask anything about your class</h2>
          <p className="mt-1 text-small text-muted-foreground">
            Lens reads your class&apos;s numbers, topics and flags. It never sees full chats, and it never sends anything
            for you.
          </p>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2" aria-label="Suggested questions">
            {lensSuggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => ask(s)}
                  className="min-h-11 w-full rounded-md border px-4 py-3 text-left text-small transition-colors duration-150 ease-out hover:bg-hover"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="grid gap-6" aria-label="Conversation with Lens" aria-live="polite" aria-busy={busy}>
          {messages.map((m) => (
            <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "user" ? (
                <div className="max-w-[85%] rounded-lg bg-primary-soft px-4 py-3 whitespace-pre-wrap">
                  {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                </div>
              ) : (
                <div className="grid w-full min-w-0 gap-3">
                  {m.parts.map((p, i) =>
                    p.type === "text" ? (
                      p.text.trim() ? (
                        <div key={i} className="min-w-0 break-words">
                          <Markdown>{p.text}</Markdown>
                        </div>
                      ) : null
                    ) : (
                      <ToolView key={i} part={p} />
                    ),
                  )}
                </div>
              )}
            </li>
          ))}
          {status === "submitted" ? (
            <li className="flex items-center gap-2 text-small text-muted-foreground" role="status">
              <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
              Lens is thinking…
            </li>
          ) : null}
        </ol>
      )}

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-small">
          <span>{friendlyError(error)}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => clearError()}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {last?.role === "assistant" && status === "ready" ? (
        <div className="flex flex-wrap gap-2" aria-label="Next steps">
          <Button type="button" variant="outline" onClick={() => ask(lensActions.draftEmail)}>
            <Mail aria-hidden="true" />
            Draft email
          </Button>
          <Button type="button" variant="outline" onClick={() => ask(lensActions.makeQuiz)}>
            <ListChecks aria-hidden="true" />
            Make quiz
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMessages([])}>
            <RotateCcw aria-hidden="true" />
            New question
          </Button>
        </div>
      ) : null}

      <div ref={endRef} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-4 flex items-end gap-2 rounded-lg border bg-surface p-2 shadow-lift"
      >
        <Label htmlFor="lens-input" className="sr-only">
          Ask Lens
        </Label>
        <Textarea
          id="lens-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              ask(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Ask anything about your class"
          className="min-h-11 resize-none border-0 bg-transparent shadow-none"
        />
        {busy ? (
          <Button type="button" size="icon" variant="outline" onClick={() => stop()} aria-label="Stop">
            <Square aria-hidden="true" />
          </Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Ask Lens" disabled={!input.trim()}>
            <ArrowUp aria-hidden="true" />
          </Button>
        )}
      </form>
    </div>
  );
}
