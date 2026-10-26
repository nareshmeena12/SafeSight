"use client";

import { Camera, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { editableToLines, linesToEditable } from "@/lib/photos/transcript";

/** Longest side after shrinking: enough for handwriting, small enough for phones on slow data. */
const MAX_SIDE = 1600;

export type PhotoReading = { photoId: string; lines: string[]; note: string; previewUrl: string };

/** The hidden file input's id: "Retake" opens it again. */
export const PHOTO_INPUT_ID = "sage-photo-input";

/**
 * Shrinks a phone photo to a JPEG before upload (also turns HEIC and huge
 * PNGs into something the server accepts). Falls back to the original file
 * if the browser can't decode it.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * The camera button in Sage's composer. Picks or takes a photo, sends it to
 * /api/sage/photo to be read, and hands the reading to <PhotoReview>.
 */
export function PhotoButton({
  target,
  disabled,
  onReading,
  onError,
  onBusy,
}: {
  target: { assignmentId: string } | { courseId: string };
  disabled: boolean;
  onReading: (reading: PhotoReading) => void;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    onBusy(true);
    const previewUrl = URL.createObjectURL(file);
    try {
      const form = new FormData();
      form.set("photo", await shrink(file), "working.jpg");
      for (const [k, v] of Object.entries(target)) form.set(k, v);
      const res = await fetch("/api/sage/photo", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as
        | { readable: true; photoId: string; lines: string[]; note: string }
        | { readable: false; note: string }
        | { error: string }
        | null;
      if (!res.ok || !body || "error" in body) {
        URL.revokeObjectURL(previewUrl);
        onError(body && "error" in body ? body.error : "Sage couldn't read that photo just now. Please try again.");
      } else if (!body.readable) {
        URL.revokeObjectURL(previewUrl);
        onError(body.note);
      } else {
        onReading({ photoId: body.photoId, lines: body.lines, note: body.note, previewUrl });
      }
    } catch {
      URL.revokeObjectURL(previewUrl);
      onError("That photo didn't upload. Check your connection and try again.");
    } finally {
      setBusy(false);
      onBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        id={PHOTO_INPUT_ID}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        aria-label="Add a photo of your working"
        title="Photo of your working"
      >
        <Camera aria-hidden="true" />
      </Button>
    </>
  );
}

/**
 * "Here's what I read": the student checks (and fixes) the transcription
 * before it goes to Sage. Nothing is sent until they press Send.
 */
export function PhotoReview({
  reading,
  sending,
  onSend,
  onRetake,
  onCancel,
}: {
  reading: PhotoReading;
  sending: boolean;
  onSend: (lines: string[], question: string) => void;
  onRetake: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(() => linesToEditable(reading.lines));
  const [question, setQuestion] = useState("");
  const lines = editableToLines(text);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);

  return (
    <section
      aria-labelledby="photo-review-title"
      className="mb-3 rounded-lg border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="photo-review-title" className="text-label">
            Here&apos;s what Sage read
          </h2>
          <p className="text-small text-muted-foreground">
            Check each line and fix anything it misread — one line of working per line. Sage will look for the first step that needs another look.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel this photo">
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview */}
        <img
          src={reading.previewUrl}
          alt="Your photo"
          className="h-32 w-full rounded-md border object-cover sm:h-full sm:max-h-56"
        />
        <div className="grid min-w-0 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="photo-lines">Your working</Label>
            <Textarea
              id="photo-lines"
              ref={area}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(10, Math.max(4, reading.lines.length + 1))}
              className="font-mono text-mono"
              maxLength={12_000}
            />
            {reading.note ? <p className="text-small text-muted-foreground">Sage&apos;s note: {reading.note}</p> : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="photo-question">Anything to ask with it? (optional)</Label>
            <Textarea
              id="photo-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={1}
              maxLength={500}
              placeholder="e.g. I think my sign is wrong somewhere"
              className="min-h-11 resize-none py-2.5"
            />
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => onSend(lines, question)} disabled={sending || !lines.length}>
          Send to Sage
        </Button>
        <Button type="button" variant="ghost" onClick={onRetake} disabled={sending}>
          <RotateCcw aria-hidden="true" />
          Retake
        </Button>
        <span className="text-small text-muted-foreground">
          {lines.length} {lines.length === 1 ? "line" : "lines"} · photos are deleted after 30 days
        </span>
      </div>
    </section>
  );
}
