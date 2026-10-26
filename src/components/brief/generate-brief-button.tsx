"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prepares (or refreshes) this week's brief for one course, then reloads the page. */
export function GenerateBriefButton({
  courseId,
  label,
  variant = "default",
}: {
  courseId: string;
  label: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Lens couldn't prepare the brief just now. Please try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lens couldn't prepare the brief just now.");
    } finally {
      setLoading(false);
    }
  }

  const Icon = variant === "default" ? Sparkles : RefreshCw;
  return (
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      <Button type="button" variant={variant} onClick={generate} disabled={loading}>
        <Icon aria-hidden="true" />
        {loading ? "Reading this week's questions…" : label}
      </Button>
      <div aria-live="polite">
        {error ? (
          <p role="alert" className="flex max-w-sm items-start gap-2 text-small text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {error}
          </p>
        ) : loading ? (
          <p className="text-small text-muted-foreground">This takes about half a minute.</p>
        ) : null}
      </div>
    </div>
  );
}
