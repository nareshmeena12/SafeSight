"use client";

import { useActionState, useState } from "react";
import { CircleAlert, CircleCheck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveNumberSet } from "@/lib/numbers/actions";
import {
  expectedAnswer,
  formatNumber,
  formatValue,
  MAX_VARIABLES,
  numberSetSchema,
  studentValues,
  type NumberSet,
} from "@/lib/numbers/numbers";
import type { FormState } from "@/lib/teacher/schemas";

type Row = { key: number; name: string; label: string; unit: string; min: string; max: string; decimals: string };

const initial: FormState = { status: "idle" };

let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, name: "", label: "", unit: "", min: "", max: "", decimals: "2" });

const toNumber = (v: string) => (v.trim() === "" ? Number.NaN : Number(v.replace(",", ".")));

function toPayload(rows: Row[], rest: { formula: string; answerLabel: string; answerUnit: string; tolerancePct: string }) {
  return {
    variables: rows.map((r) => ({
      name: r.name.trim(),
      label: r.label,
      unit: r.unit,
      min: toNumber(r.min),
      max: toNumber(r.max),
      decimals: Number(r.decimals),
    })),
    formula: rest.formula,
    answerLabel: rest.answerLabel,
    answerUnit: rest.answerUnit,
    tolerancePct: toNumber(rest.tolerancePct),
  };
}

/**
 * Variables with ranges and the answer formula for one assignment. Checks the
 * formula as the teacher types (the server checks again) and shows what one
 * sample student would get.
 */
export function NumberSetForm({
  courseId,
  assignmentId,
  set,
}: {
  courseId: string;
  assignmentId: string;
  set: NumberSet | null;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    set
      ? set.variables.map((v) => ({
          key: nextKey++,
          name: v.name,
          label: v.label,
          unit: v.unit,
          min: String(v.min),
          max: String(v.max),
          decimals: String(v.decimals),
        }))
      : [blankRow()],
  );
  const [formula, setFormula] = useState(set?.formula ?? "");
  const [answerLabel, setAnswerLabel] = useState(set?.answerLabel ?? "");
  const [answerUnit, setAnswerUnit] = useState(set?.answerUnit ?? "");
  const [tolerancePct, setTolerancePct] = useState(String(set?.tolerancePct ?? 1));
  const [state, action, pending] = useActionState(saveNumberSet, initial);

  const payload = toPayload(rows, { formula, answerLabel, answerUnit, tolerancePct });
  const check = numberSetSchema.safeParse(payload);
  const touched = formula.trim() !== "" && rows.every((r) => r.name && r.min && r.max);
  const problem = !check.success && touched ? check.error.issues[0] : null;

  const sample = check.success
    ? (() => {
        const values = studentValues(check.data.variables, { studentId: "sample-student", assignmentId });
        return { values, expected: expectedAnswer(check.data, values) };
      })()
    : null;

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={action} noValidate className="grid gap-6">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="set" value={JSON.stringify(payload)} />

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-label">Variables</legend>
        <p className="text-small text-muted-foreground">
          Each student gets their own value in every range. Write <code className="font-mono text-mono">{"{m}"}</code> in
          the instructions to show a student their value there.
        </p>
        <ul className="grid gap-3">
          {rows.map((r, i) => (
            <li key={r.key} className="grid gap-3 rounded-md border p-4 sm:grid-cols-12 sm:items-end">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor={`name-${r.key}`}>Name</Label>
                <Input
                  id={`name-${r.key}`}
                  value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                  placeholder="m"
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="grid gap-2 sm:col-span-3">
                <Label htmlFor={`label-${r.key}`}>Label</Label>
                <Input
                  id={`label-${r.key}`}
                  value={r.label}
                  onChange={(e) => update(r.key, { label: e.target.value })}
                  placeholder="Mass of water"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:col-span-4">
                <div className="grid gap-2">
                  <Label htmlFor={`min-${r.key}`}>From</Label>
                  <Input
                    id={`min-${r.key}`}
                    value={r.min}
                    onChange={(e) => update(r.key, { min: e.target.value })}
                    inputMode="decimal"
                    placeholder="0.2"
                    className="font-mono"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`max-${r.key}`}>To</Label>
                  <Input
                    id={`max-${r.key}`}
                    value={r.max}
                    onChange={(e) => update(r.key, { max: e.target.value })}
                    inputMode="decimal"
                    placeholder="0.8"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 sm:col-span-3">
                <div className="grid gap-2">
                  <Label htmlFor={`unit-${r.key}`}>Unit</Label>
                  <Input
                    id={`unit-${r.key}`}
                    value={r.unit}
                    onChange={(e) => update(r.key, { unit: e.target.value })}
                    placeholder="kg"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`decimals-${r.key}`}>Decimals</Label>
                  <Input
                    id={`decimals-${r.key}`}
                    type="number"
                    min={0}
                    max={4}
                    value={r.decimals}
                    onChange={(e) => update(r.key, { decimals: e.target.value })}
                    className="font-mono"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove variable ${i + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={rows.length >= MAX_VARIABLES}
            onClick={() => setRows((rs) => [...rs, blankRow()])}
          >
            <Plus aria-hidden="true" />
            Add variable
          </Button>
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-label">Answer</legend>
        <div className="grid gap-2">
          <Label htmlFor="formula">Formula</Label>
          <Input
            id="formula"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="m * 4.18 * (T2 - T1)"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="formula-hint"
          />
          <p id="formula-hint" className="text-sm text-muted-foreground">
            Use the names above with + − × ÷ ^ and brackets, plus sqrt, ln, log, exp, sin, cos, tan, abs, min, max, pi
            and e. Students never see the formula.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="answerLabel">What the answer is</Label>
            <Input id="answerLabel" value={answerLabel} onChange={(e) => setAnswerLabel(e.target.value)} placeholder="Heat added" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="answerUnit">Unit</Label>
            <Input id="answerUnit" value={answerUnit} onChange={(e) => setAnswerUnit(e.target.value)} placeholder="kJ" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tolerancePct">Tolerance (%)</Label>
            <Input
              id="tolerancePct"
              value={tolerancePct}
              onChange={(e) => setTolerancePct(e.target.value)}
              inputMode="decimal"
              className="font-mono"
              aria-describedby="tolerance-hint"
            />
          </div>
        </div>
        <p id="tolerance-hint" className="-mt-2 text-sm text-muted-foreground">
          An answer within this share of the student&apos;s own expected answer counts as matching, so rounding is fine.
        </p>
      </fieldset>

      <div aria-live="polite" className="grid gap-3">
        {problem ? (
          <p className="flex items-start gap-2 text-small text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {problem.message}
          </p>
        ) : null}
        {sample ? (
          <div className="rounded-md bg-primary-soft p-4 text-small">
            <p className="text-label">A sample student would get</p>
            <p className="mt-1 font-mono text-mono">
              {check.success ? check.data.variables.map((v) => formatValue(v, sample.values[v.name])).join(" · ") : null}
            </p>
            <p className="mt-1">
              Expected answer:{" "}
              <span className="font-mono text-mono">
                {sample.expected === null ? "—" : `${formatNumber(sample.expected)}${answerUnit ? ` ${answerUnit}` : ""}`}
              </span>
            </p>
          </div>
        ) : null}
        {state.status === "error" && state.message ? (
          <p role="alert" className="flex items-start gap-2 text-small text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {state.message}
          </p>
        ) : null}
        {state.status === "success" ? (
          <p role="status" className="flex items-start gap-2 text-small">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={1.5} aria-hidden="true" />
            {state.message}
          </p>
        ) : null}
      </div>

      <div>
        <Button type="submit" disabled={pending || !check.success}>
          {pending ? "Saving…" : set ? "Save changes" : "Turn on per-student numbers"}
        </Button>
      </div>
    </form>
  );
}
