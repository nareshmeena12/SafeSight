"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A test whose time ran out while the student was away is handed in here;
 * a test being marked is checked every few seconds (and, if marking stopped
 * part-way, marked again after a while).
 */
export function MockStatus({ testId, mode }: { testId: string; mode: "expired" | "marking" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const submit = async () => {
      const res = await fetch(`/api/exam/mock/${testId}/submit`, { method: "POST" }).catch(() => null);
      if (res && !res.ok && res.status !== 409) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Sage couldn't mark your test just now. Your answers are saved — try again in a minute.");
      }
      router.refresh();
    };
    // Hand in once, even when React runs the effect twice.
    if (mode === "expired" && !started.current) {
      started.current = true;
      void submit();
    }
    const poll = setInterval(() => router.refresh(), 4000);
    const retry = mode === "marking" ? setTimeout(() => void submit(), 95_000) : undefined;
    return () => {
      clearInterval(poll);
      clearTimeout(retry);
    };
  }, [mode, router, testId]);

  return error ? (
    <p role="alert" className="mt-3 text-small text-muted-foreground">
      {error}
    </p>
  ) : null;
}
