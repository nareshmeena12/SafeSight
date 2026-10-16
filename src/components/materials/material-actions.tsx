"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Re-read or remove one material. */
export function MaterialActions({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"reprocess" | "delete" | null>(null);

  async function run(kind: "reprocess" | "delete") {
    if (kind === "delete" && !window.confirm(`Remove “${title}”? Sage will stop citing it.`)) return;
    setBusy(kind);
    await fetch(`/api/materials/${id}`, { method: kind === "delete" ? "DELETE" : "POST" }).catch(() => null);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" onClick={() => run("reprocess")} disabled={busy !== null} aria-label={`Read “${title}” again`}>
        <RefreshCw className={busy === "reprocess" ? "motion-safe:animate-pulse" : undefined} aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => run("delete")} disabled={busy !== null} aria-label={`Remove “${title}”`}>
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}
