"use client";

import { Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Writes a timed mock test from the plan's topics and the notes, then opens it. The clock starts once it's ready. */
export function StartMockButton({
  planId,
  size,
  label,
  variant = "secondary",
  sizeVariant = "default",
}: {
  planId: string;
  size: "short" | "full";
  label?: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  sizeVariant?: "default" | "sm";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/exam/mock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId, size }),
      });
      const body = (await res.json().catch(() => null)) as { testId?: string; error?: string } | null;
      if (!res.ok || !body?.testId) throw new Error(body?.error ?? "Sage couldn't write your mock test just now. Please try again.");
      router.push(`/student/exam/mock/${body.testId}`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Sage couldn't write your mock test just now. Please try again.");
      setPending(false);
    }
  }

  return (
    <span>
      <Button type="button" variant={variant} size={sizeVariant} onClick={start} disabled={pending} aria-busy={pending}>
        <Timer aria-hidden="true" />
        {pending ? "Writing your test…" : (label ?? (size === "full" ? "Mock test · 45 min" : "Short mock · 20 min"))}
      </Button>
      {error ? (
        <span role="alert" className="mt-2 block text-small text-muted-foreground">
          {error}
        </span>
      ) : null}
    </span>
  );
}
