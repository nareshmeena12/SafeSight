"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveCourseOutcomes, type ActionResult } from "@/lib/accreditation/actions";
import { outcomesToText } from "@/lib/setup/topic-map";
import { StatusNote } from "./status-note";

/**
 * The course outcomes as "CO1: …" lines. The same COs as the topic map on
 * the setup page (S22); outcomes that keep their code keep their mappings.
 */
export function CourseOutcomesEditor({
  courseId,
  outcomes,
}: {
  courseId: string;
  outcomes: { id: string; code: string; description: string }[];
}) {
  const [editing, setEditing] = useState(outcomes.length === 0);
  const [text, setText] = useState(outcomesToText(outcomes));
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await saveCourseOutcomes({ courseId, text });
      setStatus(result);
      if (result.status === "success") setEditing(false);
    });

  if (!editing) {
    return (
      <div className="grid gap-4">
        <ol className="grid gap-2">
          {outcomes.map((o) => (
            <li key={o.id} className="grid grid-cols-[4rem_1fr] gap-3 text-small">
              <span className="font-mono text-primary">{o.code}</span>
              <span>{o.description}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setText(outcomesToText(outcomes));
              setEditing(true);
              setStatus(null);
            }}
          >
            <Pencil aria-hidden="true" />
            Edit course outcomes
          </Button>
          <StatusNote status={status} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <Label htmlFor="course-outcomes">Course outcomes, one per line</Label>
      <Textarea
        id="course-outcomes"
        rows={Math.min(12, Math.max(4, text.split("\n").length + 1))}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"CO1: Apply the first law of thermodynamics to closed and open systems\nCO2: Evaluate entropy change for reversible and irreversible processes"}
        aria-describedby="course-outcomes-hint"
      />
      <p id="course-outcomes-hint" className="text-small text-muted-foreground">
        As “CO1: what students can do”. Start with a verb (apply, analyse, design). Removing a CO removes its mappings.
      </p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <StatusNote status={status} className="sm:mr-auto" />
        {outcomes.length ? (
          <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save course outcomes"}
        </Button>
      </div>
    </div>
  );
}
