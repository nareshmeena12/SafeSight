"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Draft = { question: string; tried: string; stuckOn: string };

/**
 * "Still stuck? Ask your teacher": Sage drafts the question from the chat,
 * the student edits it, and only then is it sent to the teacher and the
 * course's teaching assistants. The chat itself stays private unless the
 * student also shares it with their teacher.
 */
export function AskTeacherDialog({
  open,
  onOpenChange,
  courseId,
  assignmentId,
  conversationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  assignmentId: string | null;
  conversationId: string | null;
}) {
  const [draft, setDraft] = useState<Draft>({ question: "", tried: "", stuckOn: "" });
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"model" | "chat" | "empty" | null>(null);
  const [share, setShare] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [draftedFor, setDraftedFor] = useState<string | null>(null);

  /** Drafts from the chat each time the dialog opens on a chat it hasn't drafted yet. */
  async function prepare() {
    setError(null);
    setSent(false);
    if (!conversationId || draftedFor === conversationId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/doubts/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const body = (await res.json().catch(() => null)) as { summary: Draft; source: "model" | "chat" | "empty" } | null;
      if (res.ok && body) {
        setDraft(body.summary);
        setSource(body.source);
        setDraftedFor(conversationId);
      }
    } catch {
      // The student can still write it themselves.
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/doubts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, assignmentId, conversationId, ...draft, shareChat: share && Boolean(conversationId) }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "That didn't send. Please try again in a moment.");
        return;
      }
      setSent(true);
      setDraft({ question: "", tried: "", stuckOn: "" });
      setDraftedFor(null);
      setShare(false);
    } catch {
      setError("That didn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const field = (key: keyof Draft, label: string, hint: string, rows: number, max: number) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`doubt-${key}`}>{label}</Label>
      {loading ? (
        <Skeleton className="h-16 w-full rounded-md" />
      ) : (
        <Textarea
          id={`doubt-${key}`}
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          rows={rows}
          maxLength={max}
          placeholder={hint}
        />
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto" onOpenAutoFocus={() => void prepare()}>
        {sent ? (
          <>
            <DialogHeader>
              <span className="mb-2 grid size-10 place-items-center rounded-full bg-primary-soft text-primary">
                <CircleCheck className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <DialogTitle>Sent to your teacher</DialogTitle>
              <DialogDescription>
                You&apos;ll see the answer under Doubts, and we&apos;ll let you know when it arrives. Keep going with Sage in the meantime — you might crack it first.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button asChild variant="secondary">
                <Link href="/student/doubts">See your questions</Link>
              </Button>
              <Button onClick={() => onOpenChange(false)}>Back to the chat</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Ask your teacher</DialogTitle>
              <DialogDescription>
                {source === "model"
                  ? "Sage wrote this from your chat. Check it, change anything, then send."
                  : "Tell your teacher what you're stuck on. A clear question gets a faster answer."}
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {field("question", "Your question", "How do I…", 3, 1000)}
              {field("tried", "What you've tried", "What you worked out so far, even if you're not sure it's right", 3, 1500)}
              {field("stuckOn", "Where you're stuck", "The exact step that doesn't make sense", 2, 1000)}
              {conversationId ? (
                <label className="flex min-h-11 items-start gap-3 rounded-md border p-3">
                  <Switch checked={share} onCheckedChange={setShare} className="mt-0.5" aria-describedby="doubt-share-hint" />
                  <span className="grid gap-0.5">
                    <span className="text-label">Also share this chat with my teacher</span>
                    <span id="doubt-share-hint" className="text-small text-muted-foreground">
                      Off: your teacher sees only what&apos;s in the boxes above. On: your teacher can read this whole chat too.
                    </span>
                  </span>
                </label>
              ) : null}
              <p className="text-small text-muted-foreground">
                Your teacher and the course&apos;s teaching assistants will see this question with your name. Teaching assistants never see your chats.
              </p>
              {error ? (
                <p role="alert" className="text-small text-critical">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Not now
                </Button>
                <Button type="submit" disabled={sending || loading || draft.question.trim().length < 5}>
                  {sending ? "Sending…" : "Send to your teacher"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
