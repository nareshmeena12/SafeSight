"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Send,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { coalesceEvents } from "@/lib/trace/metrics";
import type { TraceBatch, WritingEvent, WritingEventType } from "@/lib/trace/schemas";
import { visibleLength, wordCount } from "@/lib/trace/text";
import { traceExtensions } from "./extensions";
import "./trace.css";

/** How often the editor sends recorded events and the latest document. */
export const BATCH_INTERVAL_MS = 5_000;

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

/** Characters a transaction inserted (from its replace steps). */
function insertedLength(tr: Transaction) {
  let n = 0;
  for (const step of tr.steps) {
    const slice = (step as { slice?: { content: { size: number; textBetween: (a: number, b: number, s: string, l: string) => string } } }).slice;
    if (slice) n += visibleLength(slice.content.textBetween(0, slice.content.size, "\n", "\n"));
  }
  return n;
}

const docLength = (doc: Transaction["doc"]) =>
  visibleLength(doc.textBetween(0, doc.content.size, "\n", "\n"));

/**
 * The Trace writing space. Autosaves every 5 seconds and records how the text
 * is written: typing, pastes, deletions, focus and blur.
 */
export function TraceEditor({
  submissionId,
  initialContent,
}: {
  submissionId: string;
  initialContent: string;
}) {
  const router = useRouter();
  const queue = useRef<WritingEvent[]>([]);
  const dirty = useRef(false);
  const pending = useRef<Promise<void> | null>(null);
  /** Set once submitted: nothing more is sent. */
  const closed = useRef(false);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const record = useCallback((type: WritingEventType, size: number) => {
    queue.current.push({ type, size, at: Date.now() });
  }, []);

  const editor = useEditor({
    extensions: traceExtensions,
    content: initialContent || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Your answer",
        "aria-multiline": "true",
        role: "textbox",
        class: "min-h-[50vh] px-4 py-6 sm:px-8",
      },
    },
    onUpdate: ({ transaction }) => {
      dirty.current = true;
      const inserted = insertedLength(transaction);
      const net = docLength(transaction.doc) - docLength(transaction.before);
      const deleted = Math.max(0, inserted - net);
      const ui = transaction.getMeta("uiEvent");
      if (inserted > 0) record(ui === "paste" || ui === "drop" ? "paste" : "type", inserted);
      if (deleted > 0) record("delete", deleted);
    },
    onFocus: () => record("focus", 0),
    onBlur: () => record("blur", 0),
  });

  /** Takes everything not yet sent. `withContent` forces the document in. */
  const takeBatch = useCallback(
    (withContent = false): TraceBatch | null => {
      if (closed.current) return null;
      const events = coalesceEvents(queue.current.splice(0));
      const includeContent = editor && (dirty.current || withContent);
      if (!events.length && !includeContent) return null;
      dirty.current = false;
      return includeContent
        ? { events, content: editor.getHTML(), charCount: visibleLength(editor.getText()) }
        : { events };
    },
    [editor],
  );

  const giveBack = useCallback((batch: TraceBatch) => {
    queue.current.unshift(...batch.events);
    if (batch.content !== undefined) dirty.current = true;
  }, []);

  const flush = useCallback(async () => {
    if (pending.current) return pending.current;
    const batch = takeBatch();
    if (!batch) return;
    setSave({ kind: "saving" });
    pending.current = (async () => {
      try {
        const res = await fetch(`/api/trace/${submissionId}/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch),
        });
        if (res.status === 409) {
          closed.current = true;
          router.refresh();
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setSave({ kind: "saved", at: new Date() });
      } catch {
        giveBack(batch);
        setSave({ kind: "error", message: "Not saved yet. We'll keep trying." });
      } finally {
        pending.current = null;
      }
    })();
    return pending.current;
  }, [giveBack, router, submissionId, takeBatch]);

  // Batch every 5 seconds, and send what's left when the page is hidden.
  useEffect(() => {
    const timer = window.setInterval(() => void flush(), BATCH_INTERVAL_MS);
    const sendNow = () => {
      if (pending.current) return;
      const batch = takeBatch();
      if (!batch) return;
      const body = JSON.stringify(batch);
      const url = `/api/trace/${submissionId}/batch`;
      const sent = navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }));
      if (!sent) {
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => giveBack(batch));
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendNow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendNow);
      sendNow();
    };
  }, [flush, giveBack, submissionId, takeBatch]);

  const stats = useEditorState({
    editor,
    selector: ({ editor }) => {
      const text = editor?.getText() ?? "";
      return { words: wordCount(text), empty: visibleLength(text) === 0 };
    },
  });

  async function submit() {
    if (!editor) return;
    setSubmitting(true);
    setSubmitError(null);
    await pending.current;
    const batch = takeBatch(true);
    if (!batch) {
      router.refresh();
      return;
    }
    // Hold autosave while submitting; reopened below if submitting fails.
    closed.current = true;
    try {
      const res = await fetch(`/api/trace/${submissionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "We couldn't submit just now. Please try again.");
      }
      editor.setEditable(false);
      setConfirmOpen(false);
      router.refresh();
    } catch (e) {
      closed.current = false;
      giveBack(batch);
      setSubmitError(e instanceof Error ? e.message : "We couldn't submit just now. Please try again.");
      setSubmitting(false);
    }
  }

  const words = stats?.words ?? 0;
  const empty = stats?.empty ?? true;

  return (
    <div className="rounded-lg border bg-surface">
      {/* Sticks under the app's 64px top bar while writing long answers. */}
      <div className="sticky top-16 z-10 flex items-center gap-1 overflow-x-auto rounded-t-lg border-b bg-surface px-2 py-1">
        <Toolbar editor={editor} />
      </div>

      <div className={"trace-prose relative"}>
        {editor && empty ? (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute top-6 left-4 text-muted-foreground sm:left-8"
          >
            Start writing your answer here…
          </p>
        ) : null}
        <EditorContent editor={editor} />
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-small text-muted-foreground" aria-live="polite">
          <span className="font-mono">{words.toLocaleString("en-IN")}</span>{" "}
          {words === 1 ? "word" : "words"} · <SaveLabel state={save} />
        </p>
        <Button onClick={() => setConfirmOpen(true)} disabled={!editor || empty || submitting}>
          <Send aria-hidden="true" />
          Submit
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => !submitting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your work?</DialogTitle>
            <DialogDescription>
              Your teacher will see the final text and a short summary of how it was written. You
              won&apos;t be able to edit it after submitting.
            </DialogDescription>
          </DialogHeader>
          {submitError ? (
            <p role="alert" className="text-small text-destructive">
              {submitError}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={submitting}>
                Keep writing
              </Button>
            </DialogClose>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaveLabel({ state }: { state: SaveState }) {
  switch (state.kind) {
    case "idle":
      return <>Autosaves as you write</>;
    case "saving":
      return <>Saving…</>;
    case "saved":
      return (
        <>
          Saved{" "}
          <time dateTime={state.at.toISOString()}>
            {state.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </time>
        </>
      );
    case "error":
      return <span className="text-foreground">{state.message}</span>;
  }
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      heading: editor?.isActive("heading", { level: 2 }) ?? false,
      bullet: editor?.isActive("bulletList") ?? false,
      ordered: editor?.isActive("orderedList") ?? false,
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
    }),
  });

  const items: { label: string; icon: LucideIcon; pressed?: boolean; disabled?: boolean; run: () => void }[] =
    [
      { label: "Bold", icon: Bold, pressed: active?.bold, run: () => editor?.chain().focus().toggleBold().run() },
      { label: "Italic", icon: Italic, pressed: active?.italic, run: () => editor?.chain().focus().toggleItalic().run() },
      {
        label: "Heading",
        icon: Heading2,
        pressed: active?.heading,
        run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        label: "Bulleted list",
        icon: List,
        pressed: active?.bullet,
        run: () => editor?.chain().focus().toggleBulletList().run(),
      },
      {
        label: "Numbered list",
        icon: ListOrdered,
        pressed: active?.ordered,
        run: () => editor?.chain().focus().toggleOrderedList().run(),
      },
      { label: "Undo", icon: Undo2, disabled: !active?.canUndo, run: () => editor?.chain().focus().undo().run() },
      { label: "Redo", icon: Redo2, disabled: !active?.canRedo, run: () => editor?.chain().focus().redo().run() },
    ];

  return (
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-1">
      {items.map(({ label, icon: Icon, pressed, disabled, run }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          aria-pressed={pressed === undefined ? undefined : pressed}
          disabled={!editor || disabled}
          onClick={run}
          className={cn(pressed && "bg-primary-soft text-primary hover:bg-primary-soft")}
        >
          <Icon aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}
