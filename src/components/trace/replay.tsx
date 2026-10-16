"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { ClipboardPaste, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SESSION_GAP_MS } from "@/lib/trace/metrics";
import { buildReplayClock, latestAt } from "@/lib/trace/replay";
import type { WritingEventType } from "@/lib/trace/schemas";
import { TRACE_TIME_ZONE } from "@/lib/trace/summary";
import { traceExtensions } from "./extensions";
import "./trace.css";

export type ReplayEvent = { type: WritingEventType; size: number; at: number };
export type ReplaySnapshot = { at: number; content: string; charCount: number };

const speeds = [1, 4, 16] as const;

const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: TRACE_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const clock = new Intl.DateTimeFormat("en-IN", {
  timeZone: TRACE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Replays how a piece of work was written: a scrubber over the recorded
 * timeline (long pauses squeezed), the document as it stood at each moment,
 * and paste events marked in Insight amber.
 */
export function TraceReplay({
  events,
  snapshots,
  finalContent,
}: {
  events: ReplayEvent[];
  snapshots: ReplaySnapshot[];
  finalContent: string;
}) {
  const replayClock = useMemo(
    () => buildReplayClock([...events.map((e) => e.at), ...snapshots.map((s) => s.at)]),
    [events, snapshots],
  );
  const pastes = useMemo(() => events.filter((e) => e.type === "paste"), [events]);
  const sessionStarts = useMemo(() => {
    const starts: number[] = [];
    for (let i = 1; i < events.length; i++) {
      if (events[i].at - events[i - 1].at > SESSION_GAP_MS) starts.push(events[i].at);
    }
    return starts;
  }, [events]);

  const [position, setPosition] = useState(replayClock.duration);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof speeds)[number]>(4);
  const hasTimeline = replayClock.duration > 0;

  const wall = replayClock.toWall(position);
  const atEnd = position >= replayClock.duration;
  const snapshot = latestAt(snapshots, wall);
  const content = atEnd ? finalContent : (snapshot?.content ?? "");

  const editor = useEditor({
    extensions: traceExtensions,
    content: finalContent,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: { "aria-label": "Document at this point in the replay", class: "px-4 py-6 sm:px-8" },
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [editor, content]);

  // Playback loop.
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let frame = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : now - last.current;
      last.current = now;
      let done = false;
      setPosition((p) => {
        const next = Math.min(replayClock.duration, p + dt * speed);
        done = next >= replayClock.duration;
        return next;
      });
      if (done) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, replayClock.duration]);

  function togglePlay() {
    if (!playing && atEnd) setPosition(0);
    setPlaying((p) => !p);
  }

  const pct = (at: number) =>
    hasTimeline ? `${(replayClock.toReplay(at) / replayClock.duration) * 100}%` : "0%";

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-lg border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 sm:px-8">
          <p className="text-small text-muted-foreground">
            {hasTimeline ? (
              <>
                {atEnd ? "Final text" : "As written at"}{" "}
                {!atEnd ? <time className="font-mono">{dateTime.format(wall)}</time> : null}
              </>
            ) : (
              "Final text"
            )}
          </p>
          <p className="flex items-center gap-2 text-small text-muted-foreground">
            <span aria-hidden="true" className="h-3 w-4 rounded-[2px] border-b-2 border-insight bg-insight-soft" />
            Pasted text
          </p>
        </div>
        <div className={cn("trace-prose", "trace-show-pastes", "max-h-[60vh] min-h-48 overflow-y-auto")}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {hasTimeline ? (
        <div className="rounded-lg border bg-surface p-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="secondary"
              onClick={togglePlay}
              aria-label={playing ? "Pause replay" : atEnd ? "Replay from the start" : "Play replay"}
            >
              {playing ? <Pause aria-hidden="true" /> : atEnd ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}
            </Button>

            <div className="relative min-w-0 flex-1">
              {/* Event marks: pastes in amber, new sessions as thin lines. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-3">
                {sessionStarts.map((at) => (
                  <span
                    key={`s${at}`}
                    className="absolute top-0 h-3 w-px bg-border-strong"
                    style={{ left: pct(at) }}
                  />
                ))}
                {pastes.map((p, i) => (
                  <span
                    key={`p${i}`}
                    className="absolute top-0 h-3 w-1.5 -translate-x-1/2 rounded-full bg-insight"
                    style={{ left: pct(p.at) }}
                  />
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={replayClock.duration}
                step={100}
                value={position}
                onChange={(e) => {
                  setPlaying(false);
                  setPosition(Number(e.target.value));
                }}
                aria-label="Replay position"
                aria-valuetext={atEnd ? "Final text" : dateTime.format(wall)}
                className="mt-2 h-11 w-full cursor-pointer accent-primary"
              />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-small text-muted-foreground">
              Long pauses are shortened. Marks show{" "}
              <span className="text-foreground">pastes</span> and new sessions.
            </p>
            <div role="group" aria-label="Replay speed" className="flex gap-1">
              {speeds.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={speed === s ? "secondary" : "ghost"}
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(s)}
                  className="font-mono"
                >
                  {s}×
                </Button>
              ))}
            </div>
          </div>

          {pastes.length > 0 ? (
            <ul className="mt-4 grid gap-1 border-t pt-4" aria-label="Paste events">
              {pastes.map((p, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      // The first snapshot that includes the paste.
                      const shown = snapshots.find((s) => s.at >= p.at)?.at ?? p.at;
                      setPosition(replayClock.toReplay(shown));
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-hover"
                  >
                    <ClipboardPaste className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    <span className="font-mono text-small">{clock.format(p.at)}</span>
                    <span className="text-small">
                      Paste of <span className="font-mono">{p.size.toLocaleString("en-IN")}</span> characters
                    </span>
                    <span className="ml-auto text-small text-primary">Jump</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
