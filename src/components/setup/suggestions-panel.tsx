"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Lightbulb, Plus, X } from "lucide-react";
import { ModeBadge } from "@/components/product/mode-badge";
import { AssignmentDialog } from "@/components/teacher/assignment-dialog";
import type { CoursePolicy } from "@/lib/admin/policy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markSuggestion } from "@/lib/setup/actions";
import type { Suggestion } from "@/lib/setup/suggestions";

/**
 * Suggested assignments per unit with a recommended AI mode. Nothing is
 * created until the teacher opens one in the normal assignment form and
 * saves it there.
 */
export function SuggestionsPanel({
  courseId,
  suggestions,
  hasMap,
  aiReady,
  policy,
}: {
  courseId: string;
  suggestions: Suggestion[];
  hasMap: boolean;
  aiReady: boolean;
  /** S23: the course's AI policy, so a suggestion's mode can't break it. */
  policy?: CoursePolicy | null;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const open = suggestions.filter((s) => s.status === "new");
  const used = suggestions.filter((s) => s.status === "used");

  async function suggest() {
    setWorking(true);
    setError(null);
    const res = await fetch("/api/setup/suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setWorking(false);
    if (!res?.ok) return setError(body?.error ?? "We couldn't come up with suggestions. Please try again.");
    router.refresh();
  }

  const mark = (suggestionId: string, status: "used" | "dismissed") =>
    startTransition(async () => {
      await markSuggestion({ courseId, suggestionId, status });
    });

  return (
    <section id="suggestions" aria-labelledby="suggestions-title" className="scroll-mt-24 rounded-lg border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="suggestions-title" className="text-title">
            Suggested assignments
          </h2>
          <p className="text-small text-muted-foreground">
            One per unit, with how Sage should help. Open one to edit it, set a due date and save.
          </p>
        </div>
        {hasMap && aiReady ? (
          <Button variant={open.length ? "outline" : "default"} onClick={suggest} disabled={working}>
            <Lightbulb aria-hidden="true" />
            {working ? "Thinking…" : open.length ? "Suggest again" : "Suggest assignments"}
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="text-small text-destructive empty:hidden">
        {error}
      </p>

      {!hasMap ? (
        <p className="mt-4 rounded-md border border-dashed p-4 text-small text-muted-foreground">
          Save a topic map first. Suggestions follow its units and topics.
        </p>
      ) : !aiReady ? (
        <p className="mt-4 rounded-md border border-dashed p-4 text-small text-muted-foreground">
          Suggestions need SafeSight&apos;s AI model, which isn&apos;t set up yet. You can still create assignments from the
          course page.
        </p>
      ) : working && !open.length ? (
        <div className="mt-4 grid gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-md border bg-hover motion-reduce:animate-none" />
          ))}
        </div>
      ) : open.length ? (
        <ul className="mt-4 grid gap-3">
          {open.map((s) => (
            <li key={s.id} className="grid gap-3 rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-small text-muted-foreground">Unit {s.unit + 1}</span>
                <h3 className="text-label">{s.title}</h3>
                <ModeBadge mode={s.aiMode} />
                {s.outcomes.map((code) => (
                  <Badge key={code} variant="secondary" className="font-mono">
                    {code}
                  </Badge>
                ))}
              </div>
              <p className="whitespace-pre-line text-small text-foreground">{s.instructions}</p>
              {s.why ? <p className="text-small text-muted-foreground">{s.why}</p> : null}
              <div className="flex flex-wrap gap-2">
                <AssignmentDialog
                  courseId={courseId}
                  draft={{ title: s.title, instructions: s.instructions, aiMode: s.aiMode }}
                  policy={policy}
                  onSaved={() => mark(s.id, "used")}
                  trigger={
                    <Button size="sm">
                      <Plus aria-hidden="true" />
                      Create assignment
                    </Button>
                  }
                />
                <Button size="sm" variant="ghost" onClick={() => mark(s.id, "dismissed")} aria-label={`Dismiss “${s.title}”`}>
                  <X aria-hidden="true" />
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-dashed p-4 text-small text-muted-foreground">
          {used.length ? "You've used every suggestion. Ask again for new ideas." : "Ask for suggestions and they'll appear here."}
        </p>
      )}

      {used.length ? (
        <p className="mt-4 flex items-center gap-2 text-small text-muted-foreground">
          <Check className="size-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
          Created from suggestions: {used.map((s) => s.title).join(", ")}
        </p>
      ) : null}
    </section>
  );
}
