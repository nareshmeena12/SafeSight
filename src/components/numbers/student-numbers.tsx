"use client";

import { useActionState } from "react";
import { CircleAlert, CircleCheck, Variable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckBadge } from "@/components/numbers/check-badge";
import { saveNumericAnswer } from "@/lib/numbers/actions";
import type { CheckResult, NumberVariable } from "@/lib/numbers/numbers";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

export type StudentNumbersView = {
  assignmentId: string;
  variables: Pick<NumberVariable, "name" | "label" | "unit" | "decimals">[];
  values: Record<string, number>;
  answerLabel: string;
  answerUnit: string;
  answer: string | null;
  /** True once the written work is submitted: the answer can't change and the check is shown. */
  locked: boolean;
  /** Only passed once locked, so the check can't be used to guess. */
  result: CheckResult | null;
};

/** "Your numbers" for a per-student-numbers assignment, with the final-answer box. */
export function StudentNumbers({ view, showAnswer = true }: { view: StudentNumbersView; showAnswer?: boolean }) {
  const [state, action, pending] = useActionState(saveNumericAnswer, initial);
  const label = view.answerLabel || "Final answer";

  return (
    <section aria-labelledby="numbers-title" className="grid gap-4 rounded-lg border bg-surface p-4 sm:px-6">
      <div className="flex items-start gap-2">
        <Variable className="mt-1 size-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
        <div>
          <h2 id="numbers-title" className="text-label">
            Your numbers
          </h2>
          <p className="text-small text-muted-foreground">
            Everyone in the class has different values for this problem. Use these; Sage uses them too.
          </p>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {view.variables.map((v) => (
          <div key={v.name} className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 sm:block sm:border-0 sm:pb-0">
            <dt className="text-small text-muted-foreground">{v.label || v.name}</dt>
            <dd className="font-mono text-mono">
              {v.name} = {view.values[v.name]?.toFixed(v.decimals)}
              {v.unit ? ` ${v.unit}` : ""}
            </dd>
          </div>
        ))}
      </dl>

      {!showAnswer ? null : view.locked ? (
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <p>
            {label}: <span className="font-mono text-mono">{view.answer ?? "none given"}</span>
          </p>
          {view.answer ? <CheckBadge result={view.result} /> : null}
        </div>
      ) : (
        <form action={action} noValidate className="grid gap-2 border-t pt-4">
          <input type="hidden" name="assignmentId" value={view.assignmentId} />
          <Label htmlFor="numeric-answer">
            {label}
            {view.answerUnit ? ` (${view.answerUnit})` : ""}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="numeric-answer"
              name="answer"
              defaultValue={view.answer ?? ""}
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 41.8"
              className="font-mono sm:max-w-xs"
              aria-describedby="numeric-answer-hint"
              aria-invalid={state.fieldErrors?.answer ? true : undefined}
            />
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? "Saving…" : view.answer ? "Update answer" : "Save answer"}
            </Button>
          </div>
          <p id="numeric-answer-hint" className="text-sm text-muted-foreground">
            Your teacher sees this with your work. You can change it until you submit; the check appears after that.
          </p>
          <div aria-live="polite">
            {state.status === "error" ? (
              <p className="flex items-start gap-2 text-small text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                {state.fieldErrors?.answer ?? state.message}
              </p>
            ) : state.status === "success" ? (
              <p className="flex items-start gap-2 text-small">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={1.5} aria-hidden="true" />
                {state.message}
              </p>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
