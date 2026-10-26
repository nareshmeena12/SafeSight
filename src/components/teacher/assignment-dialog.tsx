"use client";

import { useActionState, useState } from "react";
import { CircleOff, MessagesSquare, Sprout } from "lucide-react";
import { Field, FormMessage } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ResilienceCheck } from "@/components/teacher/resilience-check";
import { saveAssignment } from "@/lib/teacher/actions";
import { toDateTimeLocal, type FormState } from "@/lib/teacher/schemas";
import { cn } from "@/lib/utils";

const initial: FormState = { status: "idle" };

export const modeOptions = [
  {
    value: "learn",
    label: "Learn",
    icon: Sprout,
    description: "Sage gives hints and asks questions, never the final answer.",
  },
  {
    value: "assist",
    label: "Assist",
    icon: MessagesSquare,
    description: "Sage may explain fully, but won't write the work itself.",
  },
  {
    value: "exam",
    label: "Exam",
    icon: CircleOff,
    description: "Sage is off. Attempts to use it are noted for you.",
  },
] as const;

type Mode = (typeof modeOptions)[number]["value"];

export type AssignmentValues = {
  id: string;
  title: string;
  instructions: string;
  aiMode: Mode;
  teacherNotes: string;
  answerKey: string;
  rubric: string;
  maxHintLevel: number;
  workedExamples: boolean;
  dueAt: string | null;
};

const hintLevels = [
  { value: "1", label: "1 · Clarify only", description: "Sage only asks what they've tried and where they're stuck." },
  { value: "2", label: "2 · Up to Nudge", description: "Sage may name the idea or formula that applies." },
  { value: "3", label: "3 · Up to Guide", description: "Sage may break the problem into steps." },
  { value: "4", label: "4 · Up to Parallel example", description: "Sage may work a different problem with the same method." },
] as const;

/** How far Sage may go, and whether it may work examples. Applies in Learn and Assist. */
function SageLimits({ assignment, disabled }: { assignment?: AssignmentValues; disabled: boolean }) {
  const [level, setLevel] = useState(String(assignment?.maxHintLevel ?? 4));
  const [examples, setExamples] = useState(assignment?.workedExamples ?? true);
  const hint = hintLevels.find((h) => h.value === level);
  return (
    <>
      {disabled ? (
        // Disabled controls don't post: keep the settings for when the mode changes back.
        <>
          <input type="hidden" name="maxHintLevel" value={level} />
          {examples ? <input type="hidden" name="workedExamples" value="on" /> : null}
        </>
      ) : null}
      <fieldset className="grid gap-4 rounded-md border p-4 disabled:opacity-60" disabled={disabled}>
        <legend className="px-1 text-label">How far Sage may go</legend>
        <div className="grid gap-2">
          <Label htmlFor="maxHintLevel">Highest hint step</Label>
          <Select name="maxHintLevel" value={level} onValueChange={setLevel} disabled={disabled}>
            <SelectTrigger id="maxHintLevel" className="w-full" aria-describedby="maxHintLevel-hint">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hintLevels.map((h) => (
                <SelectItem key={h.value} value={h.value}>
                  {h.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="maxHintLevel-hint" className="text-sm text-muted-foreground">
            {hint?.description} Students climb a step only after a real attempt. Checking their own working is always on.
          </p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <Label htmlFor="workedExamples">Worked examples</Label>
            <p id="workedExamples-hint" className="text-sm text-muted-foreground">
              A fully worked problem with a different scenario and unknown, at most one per hour. Essays get structure
              notes, never sample paragraphs.
            </p>
          </div>
          <Switch
            id="workedExamples"
            name="workedExamples"
            checked={examples}
            onCheckedChange={setExamples}
            disabled={disabled}
            aria-describedby="workedExamples-hint"
            className="mt-1"
          />
        </div>
      </fieldset>
    </>
  );
}

/** The AI rule for an assignment, as three radio cards. */
function ModePicker({ value, onChange, error }: { value: Mode; onChange: (m: Mode) => void; error?: string }) {
  return (
    <fieldset className="grid gap-2" aria-describedby={error ? "aiMode-error" : undefined}>
      <legend className="mb-2 text-label">How may Sage help?</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {modeOptions.map((m) => {
          const Icon = m.icon;
          const checked = value === m.value;
          return (
            <label
              key={m.value}
              className={cn(
                "flex min-h-11 cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors duration-150 ease-out has-focus-visible:shadow-(--ss-focus-ring)",
                checked ? "border-primary bg-primary-soft" : "hover:bg-hover",
              )}
            >
              <input
                type="radio"
                name="aiMode"
                value={m.value}
                checked={checked}
                onChange={() => onChange(m.value)}
                className="sr-only"
              />
              <span className="flex items-center gap-2 text-label">
                <Icon className="size-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
                {m.label}
              </span>
              <span className="text-small text-muted-foreground">{m.description}</span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id="aiMode-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function AssignmentDialog({
  courseId,
  assignment,
  draft,
  onSaved,
  trigger,
}: {
  courseId: string;
  assignment?: AssignmentValues;
  /** A new assignment pre-filled from a suggestion (S22 course setup). */
  draft?: { title: string; instructions: string; aiMode: Mode };
  onSaved?: () => void;
  trigger: React.ReactNode;
}) {
  const start = assignment ?? draft;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(start?.aiMode ?? "learn");
  // Controlled so "Check AI resilience" reads the current text and can apply a rewrite.
  const [title, setTitle] = useState(start?.title ?? "");
  const [instructions, setInstructions] = useState(start?.instructions ?? "");
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveAssignment(prev, formData);
    // Close after a successful save (creating a course navigates away instead).
    if (result.status === "success") {
      setOpen(false);
      onSaved?.();
    }
    return result;
  }, initial);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setMode(start?.aiMode ?? "learn");
          setTitle(start?.title ?? "");
          setInstructions(start?.instructions ?? "");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{assignment ? "Edit assignment" : "New assignment"}</DialogTitle>
          <DialogDescription>Set the AI rule students see before they start.</DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="grid gap-5">
          <input type="hidden" name="courseId" value={courseId} />
          {assignment ? <input type="hidden" name="assignmentId" value={assignment.id} /> : null}
          <FormMessage message={state.status === "error" ? state.message : undefined} />
          <Field
            name="title"
            label="Title"
            placeholder="Thermodynamics problem set 3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            error={state.fieldErrors?.title}
          />
          <ModePicker value={mode} onChange={setMode} error={state.fieldErrors?.aiMode} />
          <div className="grid gap-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              name="instructions"
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="What students should do, in your own words."
              aria-invalid={state.fieldErrors?.instructions ? true : undefined}
            />
            {state.fieldErrors?.instructions ? (
              <p className="text-sm text-destructive">{state.fieldErrors.instructions}</p>
            ) : null}
          </div>
          <ResilienceCheck
            courseId={courseId}
            title={title}
            instructions={instructions}
            aiMode={mode}
            onApply={setInstructions}
          />
          <div className="grid gap-2">
            <Label htmlFor="teacherNotes">Notes for Sage</Label>
            <Textarea
              id="teacherNotes"
              name="teacherNotes"
              rows={3}
              defaultValue={assignment?.teacherNotes}
              placeholder="e.g. Focus on sign conventions. Students have not seen entropy yet."
              aria-describedby="teacherNotes-hint"
            />
            <p id="teacherNotes-hint" className="text-sm text-muted-foreground">
              Only you and Sage see these. Sage uses them to guide students and never quotes them.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="answerKey">Answer key (private)</Label>
            <Textarea
              id="answerKey"
              name="answerKey"
              rows={4}
              defaultValue={assignment?.answerKey}
              placeholder="e.g. Problem 2: W = 68.9 kJ, Q = 241.2 kJ"
              aria-describedby="answerKey-hint"
              aria-invalid={state.fieldErrors?.answerKey ? true : undefined}
              className="font-mono"
            />
            <p id="answerKey-hint" className="text-sm text-muted-foreground">
              Optional, and never shown to students. Sage checks every reply against it, so final values and model
              answers don&apos;t slip out.
            </p>
            {state.fieldErrors?.answerKey ? <p className="text-sm text-destructive">{state.fieldErrors.answerKey}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rubric">Rubric</Label>
            <Textarea
              id="rubric"
              name="rubric"
              rows={4}
              defaultValue={assignment?.rubric}
              placeholder={"One criterion per line, e.g.\nCorrect method (10): picks the right process and equations\nWorking shown (5): each step follows from the last"}
              aria-describedby="rubric-hint"
              aria-invalid={state.fieldErrors?.rubric ? true : undefined}
            />
            <p id="rubric-hint" className="text-sm text-muted-foreground">
              Optional. Draft feedback on submitted work follows it, criterion by criterion. Students can see it.
            </p>
            {state.fieldErrors?.rubric ? <p className="text-sm text-destructive">{state.fieldErrors.rubric}</p> : null}
          </div>
          <SageLimits assignment={assignment} disabled={mode === "exam"} />
          <Field
            name="dueAt"
            label="Due"
            type="datetime-local"
            defaultValue={toDateTimeLocal(assignment?.dueAt ?? null)}
            hint="Optional. India time."
            error={state.fieldErrors?.dueAt}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : assignment ? "Save changes" : "Create assignment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
