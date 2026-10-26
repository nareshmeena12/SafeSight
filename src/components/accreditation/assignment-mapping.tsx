"use client";

import { useState, useTransition } from "react";
import { ModeBadge } from "@/components/product/mode-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveAssignmentMapping, type ActionResult } from "@/lib/accreditation/actions";
import type { CourseAssignment } from "@/lib/accreditation/data";
import { CoChips } from "./co-chips";
import { StatusNote } from "./status-note";

/** One assignment: whether it counts towards CO attainment, which COs it assesses and its weight. */
export function AssignmentMapping({
  courseId,
  assignment,
  outcomes,
  marksNote,
}: {
  courseId: string;
  assignment: CourseAssignment;
  outcomes: { id: string; code: string; description: string }[];
  marksNote: string;
}) {
  const saved = assignment.assessment;
  const [include, setInclude] = useState(Boolean(saved));
  const [outcomeIds, setOutcomeIds] = useState(saved?.outcomeIds ?? []);
  const [weight, setWeight] = useState(String(saved?.weight ?? 1));
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty =
    include !== Boolean(saved) ||
    (include && (weight !== String(saved?.weight ?? 1) || [...outcomeIds].sort().join() !== [...(saved?.outcomeIds ?? [])].sort().join()));

  const save = () =>
    startTransition(async () => {
      const result = await saveAssignmentMapping({ courseId, assignmentId: assignment.id, include, outcomeIds, weight: Number(weight) });
      setStatus(result);
    });

  const id = `a-${assignment.id}`;
  return (
    <li className="grid gap-4 rounded-lg border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-label">{assignment.title}</h3>
            <ModeBadge mode={assignment.aiMode} />
          </div>
          <p className="mt-1 text-small text-muted-foreground">{marksNote}</p>
        </div>
        <div className="flex min-h-11 items-center gap-3">
          <Switch id={`${id}-include`} checked={include} onCheckedChange={setInclude} disabled={pending} />
          <Label htmlFor={`${id}-include`}>Counts towards COs</Label>
        </div>
      </div>
      {include ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div className="grid gap-2">
            <span className="text-label" id={`${id}-cos`}>
              Course outcomes it assesses
            </span>
            <CoChips outcomes={outcomes} selected={outcomeIds} onChange={setOutcomeIds} label={`Course outcomes for ${assignment.title}`} disabled={pending} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={`${id}-weight`}>Weight</Label>
            <Input id={`${id}-weight`} type="number" inputMode="decimal" min={0} max={10} step={0.5} value={weight} onChange={(e) => setWeight(e.target.value)} disabled={pending} />
          </div>
        </div>
      ) : null}
      {dirty || status ? (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <StatusNote status={status} className="sm:mr-auto" />
          {dirty ? (
            <Button type="button" onClick={save} disabled={pending || (include && !outcomeIds.length)}>
              {pending ? "Saving…" : include && !outcomeIds.length ? "Pick at least one CO" : "Save"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
