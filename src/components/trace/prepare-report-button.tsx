"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Lets the teacher run (or re-run) the Trace agent for one submission. */
export function PrepareReportButton({ submissionId, label }: { submissionId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trace/${submissionId}/report`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "We couldn't prepare the summary just now.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't prepare the summary just now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={run} disabled={busy}>
        <RefreshCw aria-hidden="true" className={busy ? "motion-safe:animate-spin" : undefined} />
        {busy ? "Preparing…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
