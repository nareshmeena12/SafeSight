"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { linkProgram, type ActionResult } from "@/lib/accreditation/actions";
import { StatusNote } from "./status-note";

export const selectClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 text-base transition-colors outline-none hover:border-border-strong focus-visible:border-primary disabled:opacity-60";

/** Picks the programme (and so the POs) this course maps to. */
export function ProgramLink({
  courseId,
  current,
  programs,
  hasMappings,
}: {
  courseId: string;
  current: string | null;
  programs: { id: string; label: string }[];
  hasMappings: boolean;
}) {
  const [value, setValue] = useState(current ?? "");
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = value !== (current ?? "");

  const save = () => {
    if (hasMappings && current && !window.confirm("Changing the programme clears this course's CO–PO mapping. Continue?")) return;
    startTransition(async () => setStatus(await linkProgram({ courseId, programId: value })));
  };

  if (!programs.length) {
    return (
      <p className="text-small text-muted-foreground">
        No programmes yet.{" "}
        <Link href="/teacher/accreditation#programmes" className="text-primary underline-offset-4 hover:underline">
          Create one
        </Link>{" "}
        (for example “B.Tech Mechanical Engineering”) with its POs, then link this course to it.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="program">Programme</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select id="program" className={selectClass} value={value} onChange={(e) => setValue(e.target.value)} disabled={pending}>
          <option value="">Not linked</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <Button type="button" onClick={save} disabled={pending || !changed} className="shrink-0">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <StatusNote status={status} />
    </div>
  );
}
