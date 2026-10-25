"use client";

import { MessageSquareQuote } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/sage/markdown";
import { Textarea } from "@/components/ui/textarea";
import { MasteryBadge } from "./mastery";

type Result = { score: number; feedback: string; gaps: string[]; mastery: { mastery: number } | null };

/**
 * Explain it back: after Sage checked a full attempt, the student says the
 * idea in their own words and gets short feedback on any gaps.
 */
export function ExplainBackCard({
  courseId,
  conversationId,
  topic,
}: {
  courseId: string;
  conversationId: string | null;
  topic: string;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const id = `explain-${topic.replace(/\W+/g, "-")}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || text.trim().length < 20) {
      if (text.trim().length < 20) setError("Write a sentence or two in your own words first.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/learning/explain-back", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, conversationId, topic, explanation: text }),
      });
      const body = (await res.json().catch(() => null)) as (Result & { error?: string }) | null;
      if (!res.ok || !body || body.error) throw new Error(body?.error ?? "Sage couldn't read that just now. Please try again.");
      setResult(body);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Sage couldn't read that just now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="mt-3 rounded-md border bg-background p-4">
      <h3 id={`${id}-title`} className="flex items-center gap-2 text-label">
        <MessageSquareQuote className="size-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
        Explain it back
      </h3>
      {result ? (
        <div className="mt-2 grid gap-2 text-small" aria-live="polite">
          {result.mastery ? (
            <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>{topic}:</span> <MasteryBadge mastery={result.mastery.mastery} />
            </p>
          ) : null}
          <Markdown>{result.feedback}</Markdown>
          {result.gaps.length ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {result.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-muted-foreground">Saved to My learning.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-2 grid gap-2">
          <label htmlFor={id} className="text-small text-muted-foreground">
            In two or three sentences, explain the idea behind <span className="text-foreground">{topic}</span> as if to a
            friend. Your own words — no need to be formal.
          </label>
          <Textarea
            id={id}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={3000}
            rows={3}
            className="min-h-24"
            placeholder="The key idea is…"
          />
          {error ? (
            <p role="alert" className="text-small text-muted-foreground">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={pending} className="justify-self-start">
            {pending ? "Reading your explanation…" : "Get feedback"}
          </Button>
        </form>
      )}
    </section>
  );
}
