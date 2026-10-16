"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lensSuggestions } from "./suggestions";

/** "Ask anything about your class" — opens the question on the Lens page. */
export function LensBox({ courseId }: { courseId?: string | null }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");

  function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    const params = new URLSearchParams({ q: text });
    if (courseId) params.set("course", courseId);
    router.push(`/teacher/lens?${params.toString()}`);
  }

  return (
    <section aria-labelledby="lens-box-title" className="rounded-lg border bg-surface p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary">
          <Sparkles className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div>
          <h2 id="lens-box-title" className="text-title">
            Ask Lens
          </h2>
          <p className="text-small text-muted-foreground">Plain-English questions about your class.</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <Label htmlFor="lens-box-input" className="sr-only">
          Ask anything about your class
        </Label>
        <Input
          id="lens-box-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about your class"
          maxLength={2000}
          autoComplete="off"
        />
        <Button type="submit" size="icon" aria-label="Ask Lens" disabled={!question.trim()}>
          <ArrowUp aria-hidden="true" />
        </Button>
      </form>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Suggested questions">
        {lensSuggestions.slice(0, 3).map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => ask(s)}
              className="min-h-11 rounded-full border px-4 py-2 text-left text-small text-muted-foreground transition-colors duration-150 ease-out hover:bg-hover hover:text-foreground"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
