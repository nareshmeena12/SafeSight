"use client";

import { useActionState, useState } from "react";
import { CircleCheck } from "lucide-react";
import { FormMessage } from "@/components/auth/field";
import { modeOptions } from "@/components/teacher/assignment-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { savePolicy } from "@/lib/admin/actions";
import { openPolicy, policyModes, type AiPolicy, type PolicyMode } from "@/lib/admin/policy";
import type { FormState } from "@/lib/teacher/schemas";
import { cn } from "@/lib/utils";

const initial: FormState = { status: "idle" };

const hintSteps = [
  { value: "1", label: "1 · Clarify only" },
  { value: "2", label: "2 · Up to Nudge" },
  { value: "3", label: "3 · Up to Guide" },
  { value: "4", label: "4 · Up to Parallel example" },
];

/**
 * The AI policy for one department, or the college default
 * (`departmentId` null). `policy` null = nothing set yet: the form starts
 * from today's open settings.
 */
export function PolicyForm({
  departmentId,
  policy,
  idPrefix,
}: {
  departmentId: string | null;
  policy: AiPolicy | null;
  /** Keeps ids unique when two forms share a page. */
  idPrefix: string;
}) {
  const start = policy ?? openPolicy;
  const [modes, setModes] = useState<PolicyMode[]>(start.allowedModes);
  const [defaultMode, setDefaultMode] = useState<PolicyMode>(start.defaultMode);
  const [state, action, pending] = useActionState(savePolicy, initial);
  const id = (name: string) => `${idPrefix}-${name}`;

  function toggle(mode: PolicyMode, on: boolean) {
    const next = policyModes.filter((m) => (m === mode ? on : modes.includes(m)));
    setModes(next);
    if (!next.includes(defaultMode) && next[0]) setDefaultMode(next[0]);
  }

  return (
    <form action={action} noValidate className="grid gap-6">
      <input type="hidden" name="departmentId" value={departmentId ?? ""} />
      <FormMessage message={state.status === "error" ? state.message : undefined} />

      <fieldset className="grid gap-2" aria-describedby={state.fieldErrors?.allowedModes ? id("modes-error") : id("modes-hint")}>
        <legend className="mb-1 text-label">Modes teachers may use</legend>
        <p id={id("modes-hint")} className="mb-1 text-small text-muted-foreground">
          Every assignment picks one. Exam turns Sage off for that assignment.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {modeOptions.map((m) => {
            const Icon = m.icon;
            const checked = modes.includes(m.value);
            return (
              <label
                key={m.value}
                className={cn(
                  "flex min-h-11 cursor-pointer gap-3 rounded-md border p-3 transition-colors duration-150 ease-out has-focus-visible:shadow-(--ss-focus-ring)",
                  checked ? "border-primary bg-primary-soft" : "hover:bg-hover",
                )}
              >
                <input
                  type="checkbox"
                  name="allowedModes"
                  value={m.value}
                  checked={checked}
                  onChange={(e) => toggle(m.value, e.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-(--ss-primary)"
                />
                <span className="grid gap-1">
                  <span className="flex items-center gap-2 text-label">
                    <Icon className="size-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
                    {m.label}
                  </span>
                  <span className="text-small text-muted-foreground">{m.description}</span>
                </span>
              </label>
            );
          })}
        </div>
        {state.fieldErrors?.allowedModes ? (
          <p id={id("modes-error")} className="text-sm text-destructive">
            {state.fieldErrors.allowedModes}
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={id("defaultMode")}>New assignments start in</Label>
          <Select name="defaultMode" value={defaultMode} onValueChange={(v) => setDefaultMode(v as PolicyMode)}>
            <SelectTrigger id={id("defaultMode")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modeOptions
                .filter((m) => modes.includes(m.value))
                .map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {state.fieldErrors?.defaultMode ? (
            <p className="text-sm text-destructive">{state.fieldErrors.defaultMode}</p>
          ) : null}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={id("maxHintLevel")}>Highest hint step</Label>
          <Select name="maxHintLevel" defaultValue={String(start.maxHintLevel)}>
            <SelectTrigger id={id("maxHintLevel")} className="w-full" aria-describedby={id("maxHintLevel-hint")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hintSteps.map((h) => (
                <SelectItem key={h.value} value={h.value}>
                  {h.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id={id("maxHintLevel-hint")} className="text-sm text-muted-foreground">
            How far Sage may go in Learn and Assist. Checking a student&apos;s own working is always on.
          </p>
        </div>
      </div>

      <div className="grid gap-4 rounded-md border p-4">
        <SwitchRow
          id={id("workedExamples")}
          name="workedExamples"
          label="Worked examples"
          hint="Sage may work a different problem with the same method, at most once an hour."
          defaultChecked={start.workedExamples}
        />
        <SwitchRow
          id={id("labModeAllowed")}
          name="labModeAllowed"
          label="Lab Mode"
          hint="Teachers may run lab exams with the SafeSight Lab extension."
          defaultChecked={start.labModeAllowed}
        />
        <SwitchRow
          id={id("teachersCanLoosen")}
          name="teachersCanLoosen"
          label="Let teachers loosen these"
          hint="Off: teachers can only be stricter than this policy. On: it's a starting point they may change. Lab Mode stays as set."
          defaultChecked={start.teachersCanLoosen}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save policy"}
        </Button>
        {state.status === "success" ? (
          <p className="flex items-center gap-2 text-small text-muted-foreground" role="status">
            <CircleCheck className="size-4 text-good" strokeWidth={1.5} aria-hidden="true" />
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function SwitchRow({
  id,
  name,
  label,
  hint,
  defaultChecked,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch id={id} name={name} defaultChecked={defaultChecked} aria-describedby={`${id}-hint`} className="mt-1" />
    </div>
  );
}
