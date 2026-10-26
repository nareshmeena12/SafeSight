"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CourseOption = { id: string; name: string };

/**
 * Where an LMS class goes: a new SafeSight course (name and code filled in
 * from the LMS) or one the teacher already has. Plain form fields, so the
 * server action reads `target`, `name` and `code`.
 */
export function TargetFields({
  idPrefix,
  courses,
  defaultTarget = "new",
  defaultName = "",
  defaultCode = "",
  disabled,
}: {
  idPrefix: string;
  courses: CourseOption[];
  defaultTarget?: string;
  defaultName?: string;
  defaultCode?: string;
  disabled?: boolean;
}) {
  const [target, setTarget] = useState(courses.some((c) => c.id === defaultTarget) ? defaultTarget : "new");
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-target`}>Import into</Label>
        <select
          id={`${idPrefix}-target`}
          name="target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={disabled}
          className="h-11 w-full min-w-0 rounded-md border bg-background px-3 text-body"
        >
          <option value="new">A new SafeSight course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {target === "new" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-name`}>Course name</Label>
            <Input id={`${idPrefix}-name`} name="name" defaultValue={defaultName.slice(0, 200)} maxLength={200} required disabled={disabled} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-code`}>
              Code <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id={`${idPrefix}-code`} name="code" defaultValue={defaultCode.slice(0, 32)} maxLength={32} placeholder="ME201" disabled={disabled} className="font-mono" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
