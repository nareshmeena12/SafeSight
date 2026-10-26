"use client";

import { RotateCw } from "lucide-react";
import { useState } from "react";
import { Markdown } from "@/components/sage/markdown";
import { cn } from "@/lib/utils";

/** Flashcards: show the answer, then the question again. */
export function Flashcards({ cards }: { cards: { front: string; back: string }[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {cards.map((c, i) => (
        <li key={`${i}-${c.front}`}>
          <Flashcard card={c} />
        </li>
      ))}
    </ul>
  );
}

function Flashcard({ card }: { card: { front: string; back: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "flex h-full min-h-32 flex-col justify-between gap-2 rounded-md border p-4 text-small transition-colors duration-150 ease-out",
        open ? "bg-primary-soft/60" : "bg-background",
      )}
    >
      <div aria-live="polite">
        <span className="sr-only">{open ? "Answer: " : "Question: "}</span>
        <Markdown>{open ? card.back : card.front}</Markdown>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-pressed={open}
        className="-mx-2 -mb-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm px-2 text-muted-foreground transition-colors duration-150 ease-out hover:bg-hover hover:text-foreground"
      >
        <RotateCw className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        {open ? "Show the question" : "Show the answer"}
      </button>
    </div>
  );
}
