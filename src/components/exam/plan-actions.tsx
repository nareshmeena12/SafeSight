"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** "Update plan" rebuilds from today with the latest mastery and mistakes; "Remove plan" deletes it after a second press. */
export function PlanActions({ planId, canRebuild }: { planId: string; canRebuild: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<"rebuild" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(kind: "rebuild" | "delete") {
    if (pending) return;
    setPending(kind);
    setError(null);
    try {
      const res = await fetch(`/api/exam/plans/${planId}`, {
        method: kind === "rebuild" ? "PATCH" : "DELETE",
        headers: { "content-type": "application/json" },
        body: kind === "rebuild" ? JSON.stringify({ rebuild: true }) : undefined,
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error);
      if (kind === "delete") router.push("/student/exam");
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "That didn't go through. Please try again.");
    } finally {
      setPending(null);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {canRebuild ? (
          <Button type="button" variant="outline" onClick={() => call("rebuild")} disabled={pending !== null} aria-busy={pending === "rebuild"}>
            <RefreshCw aria-hidden="true" />
            {pending === "rebuild" ? "Updating…" : "Update plan"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          onClick={() => (confirmDelete ? call("delete") : setConfirmDelete(true))}
          disabled={pending !== null}
        >
          <Trash2 aria-hidden="true" />
          {confirmDelete ? "Press again to remove" : "Remove plan"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-small text-muted-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}
