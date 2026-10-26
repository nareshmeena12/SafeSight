"use client";

import { Dumbbell, LifeBuoy, ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Kind = "practice" | "review" | "refresher";

const pendingText: Record<Kind, string> = {
  practice: "Making 3 problems…",
  review: "Picking your review problems…",
  refresher: "Putting a refresher together…",
};
const icons = { practice: Dumbbell, review: ListChecks, refresher: LifeBuoy } as const;

/**
 * Starts "Practice this", "Review before exam" or a refresher, then opens it.
 * Generating takes a few seconds, so the button says what's happening.
 */
export function PracticeButton({
  courseId,
  topic,
  kind = "practice",
  source = "learning",
  label,
  variant = "secondary",
  size = "default",
  className,
}: {
  courseId: string;
  topic: string;
  kind?: Kind;
  source?: "explore" | "learning" | "sage";
  label?: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm";
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = icons[kind];

  async function start() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/learning/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, topic, kind, source }),
      });
      const body = (await res.json().catch(() => null)) as { setId?: string; error?: string } | null;
      if (!res.ok || !body?.setId) throw new Error(body?.error ?? "Sage couldn't start that just now. Please try again.");
      router.push(`/student/learning/practice/${body.setId}`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Sage couldn't start that just now. Please try again.");
      setPending(false);
    }
  }

  return (
    <span className={className}>
      <Button type="button" variant={variant} size={size} onClick={start} disabled={pending} aria-busy={pending}>
        <Icon aria-hidden="true" />
        {pending ? pendingText[kind] : (label ?? "Practice this")}
      </Button>
      {error ? (
        <span role="alert" className="mt-2 block text-small text-muted-foreground">
          {error}
        </span>
      ) : null}
    </span>
  );
}
