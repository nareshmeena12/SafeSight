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
import { Textarea } from "@/components/ui/textarea";
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
  dueAt: string | null;
};

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
  trigger,
}: {
  courseId: string;
  assignment?: AssignmentValues;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(assignment?.aiMode ?? "learn");
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveAssignment(prev, formData);
    // Close after a successful save (creating a course navigates away instead).
    if (result.status === "success") setOpen(false);
    return result;
  }, initial);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMode(assignment?.aiMode ?? "learn");
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
            defaultValue={assignment?.title}
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
              defaultValue={assignment?.instructions}
              placeholder="What students should do, in your own words."
              aria-invalid={state.fieldErrors?.instructions ? true : undefined}
            />
            {state.fieldErrors?.instructions ? (
              <p className="text-sm text-destructive">{state.fieldErrors.instructions}</p>
            ) : null}
          </div>
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
