"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshMetrics } from "@/lib/teacher/actions";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

/** Recomputes this week's numbers and Reliance Scores on demand. */
export function RefreshMetricsButton({ courseId }: { courseId: string | null }) {
  const [state, action, pending] = useActionState(refreshMetrics, initial);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="courseId" value={courseId ?? ""} />
      <p aria-live="polite" className="text-small text-muted-foreground empty:hidden">
        {pending ? "" : state.message}
      </p>
      <Button type="submit" variant="outline" disabled={pending}>
        <RefreshCw className={pending ? "motion-safe:animate-spin" : undefined} aria-hidden="true" />
        {pending ? "Updating…" : "Update numbers"}
      </Button>
    </form>
  );
}
