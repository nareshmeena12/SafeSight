"use client";

import { useActionState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relinkNotes } from "@/lib/setup/actions";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

/** Matches the course's notes to its topics again (after uploading new notes). */
export function RelinkNotes({ courseId, disabled }: { courseId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(relinkNotes, initial);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="courseId" value={courseId} />
      <Button type="submit" variant="outline" disabled={pending || disabled}>
        <Link2 aria-hidden="true" />
        {pending ? "Linking…" : "Link notes to topics"}
      </Button>
      <p role="status" aria-live="polite" className={state.status === "error" ? "text-small text-destructive" : "text-small text-muted-foreground"}>
        {state.message}
      </p>
    </form>
  );
}
