"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Field, FormMessage } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveTopicMap } from "@/lib/setup/actions";
import { LIMITS, outcomesToText, textToOutcomes, textToTopics, type TopicMapDraft } from "@/lib/setup/topic-map";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

type UnitDraft = { key: number; title: string; topics: string };

// Keys start from the position, so server and browser render the same ids.
const toUnits = (units: TopicMapDraft["units"]): UnitDraft[] =>
  units.map((u, i) => ({ key: i, title: u.title, topics: u.topics.join("\n") }));

/**
 * The editable topic map: course name and code, units (title + one topic per
 * line) and course outcomes ("CO1: …" per line). Topics that keep their name
 * keep their linked notes when saved.
 */
export function TopicMapEditor({
  courseId,
  initialMap,
  onCancel,
  onSaved,
  intro,
}: {
  courseId: string;
  initialMap: TopicMapDraft;
  onCancel?: () => void;
  onSaved?: () => void;
  intro?: React.ReactNode;
}) {
  const [courseName, setCourseName] = useState(initialMap.courseName);
  const [courseCode, setCourseCode] = useState(initialMap.courseCode);
  const [units, setUnits] = useState<UnitDraft[]>(() =>
    initialMap.units.length ? toUnits(initialMap.units) : [{ key: 0, title: "", topics: "" }],
  );
  const nextKey = useRef(Math.max(1, initialMap.units.length));
  const [outcomes, setOutcomes] = useState(outcomesToText(initialMap.outcomes));
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveTopicMap(prev, formData);
    if (result.status === "success") onSaved?.();
    return result;
  }, initial);

  const cleaned = units
    .map((u) => ({ title: u.title.trim(), topics: textToTopics(u.topics) }))
    .filter((u) => u.title || u.topics.length)
    .map((u, i) => ({ title: u.title || `Unit ${i + 1}`, topics: u.topics }));
  const payload = JSON.stringify({ courseId, courseName, courseCode, units: cleaned, outcomes: textToOutcomes(outcomes) });
  const topicCount = cleaned.reduce((n, u) => n + u.topics.length, 0);

  const update = (key: number, patch: Partial<UnitDraft>) => setUnits((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  const move = (index: number, by: number) =>
    setUnits((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });

  return (
    <form action={action} className="grid gap-6" noValidate>
      <input type="hidden" name="payload" value={payload} />
      {intro}
      <FormMessage message={state.status === "error" ? state.message : undefined} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field name="courseName" label="Course name" value={courseName} onChange={(e) => setCourseName(e.target.value)} maxLength={200} required />
        </div>
        <Field name="courseCode" label="Code" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} maxLength={32} hint="Optional" />
      </div>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-label">Units and topics</legend>
        <ol className="grid gap-4">
          {units.map((u, i) => (
            <li key={u.key} className="grid gap-3 rounded-md border p-4">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field
                    name={`unit-${u.key}`}
                    label={`Unit ${i + 1}`}
                    value={u.title}
                    onChange={(e) => update(u.key, { title: e.target.value })}
                    placeholder="Basic concepts and the first law"
                    maxLength={LIMITS.title}
                  />
                </div>
                <div className="flex shrink-0 pb-0.5">
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move unit ${i + 1} up`}>
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => move(i, 1)}
                    disabled={i === units.length - 1}
                    aria-label={`Move unit ${i + 1} down`}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setUnits((list) => list.filter((x) => x.key !== u.key))}
                    disabled={units.length === 1}
                    aria-label={`Remove unit ${i + 1}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`topics-${u.key}`}>Topics, one per line</Label>
                <Textarea
                  id={`topics-${u.key}`}
                  rows={Math.min(10, Math.max(3, u.topics.split("\n").length + 1))}
                  value={u.topics}
                  onChange={(e) => update(u.key, { topics: e.target.value })}
                  placeholder={"Systems and properties\nZeroth law\nWork and heat transfer"}
                />
              </div>
            </li>
          ))}
        </ol>
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setUnits((list) => [...list, { key: nextKey.current++, title: "", topics: "" }])}
            disabled={units.length >= LIMITS.units}
          >
            <Plus aria-hidden="true" />
            Add unit
          </Button>
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="outcomes">Course outcomes</Label>
        <Textarea
          id="outcomes"
          rows={Math.min(10, Math.max(3, outcomes.split("\n").length + 1))}
          value={outcomes}
          onChange={(e) => setOutcomes(e.target.value)}
          placeholder={"CO1: Apply the first law to closed and open systems\nCO2: Evaluate entropy change in processes"}
          aria-describedby="outcomes-hint"
        />
        <p id="outcomes-hint" className="text-sm text-muted-foreground">
          One per line, as “CO1: what students can do”. Optional; useful later for accreditation reports.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-small text-muted-foreground sm:mr-auto" aria-live="polite">
          {cleaned.length} {cleaned.length === 1 ? "unit" : "units"} · {topicCount} {topicCount === 1 ? "topic" : "topics"}
        </p>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={pending || !courseName.trim()}>
          {pending ? "Saving…" : "Save topic map"}
        </Button>
      </div>
    </form>
  );
}
