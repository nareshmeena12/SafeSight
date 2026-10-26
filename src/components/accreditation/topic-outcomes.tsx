"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { saveTopicOutcomes, type ActionResult } from "@/lib/accreditation/actions";
import { CoChips } from "./co-chips";
import { StatusNote } from "./status-note";

/** Topics of the course's topic map ↔ COs, so students' own practice and mock tests count towards the right COs. */
export function TopicOutcomes({
  courseId,
  topics,
  outcomes,
  pairs,
}: {
  courseId: string;
  topics: { id: string; title: string; unit: string }[];
  outcomes: { id: string; code: string; description: string }[];
  pairs: { topicId: string; outcomeId: string }[];
}) {
  const [map, setMap] = useState(() => {
    const m: Record<string, string[]> = {};
    for (const p of pairs) (m[p.topicId] ??= []).push(p.outcomeId);
    return m;
  });
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const units = [...new Set(topics.map((t) => t.unit))];

  const save = () =>
    startTransition(async () => {
      const result = await saveTopicOutcomes({
        courseId,
        pairs: Object.entries(map).flatMap(([topicId, ids]) => ids.map((outcomeId) => ({ topicId, outcomeId }))),
      });
      setStatus(result);
      if (result.status === "success") setDirty(false);
    });

  return (
    <div className="grid gap-4">
      {units.map((unit) => (
        <div key={unit || "none"} className="grid gap-2">
          {unit ? <h3 className="text-label">{unit}</h3> : null}
          <ul className="divide-y rounded-md border">
            {topics
              .filter((t) => t.unit === unit)
              .map((t) => (
                <li key={t.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 text-small">{t.title}</span>
                  <CoChips
                    outcomes={outcomes}
                    selected={map[t.id] ?? []}
                    onChange={(ids) => {
                      setMap((m) => ({ ...m, [t.id]: ids }));
                      setDirty(true);
                    }}
                    label={`COs for ${t.title}`}
                    disabled={pending}
                  />
                </li>
              ))}
          </ul>
        </div>
      ))}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <StatusNote status={status} className="sm:mr-auto" />
        <Button type="button" onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save topic mapping"}
        </Button>
      </div>
    </div>
  );
}
