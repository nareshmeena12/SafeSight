"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAttainmentSettings, type ActionResult } from "@/lib/accreditation/actions";
import type { AttainmentSettings } from "@/lib/accreditation/attainment";
import { StatusNote } from "./status-note";

type Key = Exclude<keyof AttainmentSettings, "academicYear">;

const fields: { key: Key; label: string; hint: string; suffix?: string; step: number }[] = [
  { key: "targetPct", label: "Target score", hint: "A student attains a CO when they score at least this share of its marks.", suffix: "%", step: 5 },
  { key: "level1Pct", label: "Level 1", hint: "Share of students at the target for level 1.", suffix: "%", step: 5 },
  { key: "level2Pct", label: "Level 2", hint: "…for level 2.", suffix: "%", step: 5 },
  { key: "level3Pct", label: "Level 3", hint: "…for level 3.", suffix: "%", step: 5 },
  { key: "targetLevel", label: "Target level", hint: "The level the course aims for (1–3).", step: 0.5 },
  { key: "practiceWeight", label: "Practice weight", hint: "Students' own practice. 0 = show, don't count.", step: 0.25 },
  { key: "mockWeight", label: "Mock test weight", hint: "Students' own mock tests. 0 = show, don't count.", step: 0.25 },
];

/** Thresholds and weights for the course's CO attainment. */
export function AttainmentSettingsForm({ courseId, settings }: { courseId: string; settings: AttainmentSettings }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)])),
  );
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => startTransition(async () => setStatus(await saveAttainmentSettings({ courseId, ...values })));

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="grid content-start gap-1.5">
            <Label htmlFor={`setting-${f.key}`}>
              {f.label}
              {f.suffix ? <span className="font-normal text-muted-foreground"> ({f.suffix})</span> : null}
            </Label>
            <Input
              id={`setting-${f.key}`}
              type="number"
              inputMode="decimal"
              step={f.step}
              min={0}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              aria-describedby={`setting-${f.key}-hint`}
            />
            <p id={`setting-${f.key}-hint`} className="text-small text-muted-foreground">
              {f.hint}
            </p>
          </div>
        ))}
        <div className="grid content-start gap-1.5">
          <Label htmlFor="setting-year">Academic year</Label>
          <Input
            id="setting-year"
            value={values.academicYear}
            onChange={(e) => setValues((v) => ({ ...v, academicYear: e.target.value }))}
            placeholder="2026–27, odd semester"
            maxLength={40}
          />
          <p className="text-small text-muted-foreground">Printed on the report. Optional.</p>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <StatusNote status={status} className="sm:mr-auto" />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
