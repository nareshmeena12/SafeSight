"use client";

import { useActionState, useState } from "react";
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
import { saveExamInfo } from "@/lib/exam/actions";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

/** The teacher publishes the official syllabus topics, exam pattern and date that students' revision plans follow. */
export function ExamInfoDialog({
  courseId,
  topicsText,
  pattern,
  examDate,
  trigger,
}: {
  courseId: string;
  topicsText: string;
  pattern: string;
  examDate: string | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveExamInfo(prev, formData);
    if (result.status === "success") setOpen(false);
    return result;
  }, initial);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Syllabus and exam pattern</DialogTitle>
          <DialogDescription>
            Optional. Students&apos; revision plans follow these topics, and mock tests follow the pattern. Students can see
            everything here.
          </DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="grid gap-5">
          <input type="hidden" name="courseId" value={courseId} />
          <FormMessage message={state.status === "error" ? state.message : undefined} />
          <div className="grid gap-2">
            <Label htmlFor="exam-topics">Syllabus topics</Label>
            <Textarea
              id="exam-topics"
              name="topics"
              rows={8}
              defaultValue={topicsText}
              placeholder={"One topic per line. A line like \"Unit 2:\" starts a unit.\nUnit 1:\nFirst law for closed systems\nPolytropic processes\nUnit 2:\nEntropy change of an ideal gas"}
              aria-describedby="exam-topics-hint"
              aria-invalid={state.fieldErrors?.topics ? true : undefined}
            />
            {state.fieldErrors?.topics ? (
              <p id="exam-topics-hint" className="text-sm text-destructive">
                {state.fieldErrors.topics}
              </p>
            ) : (
              <p id="exam-topics-hint" className="text-sm text-muted-foreground">
                Up to 40 topics. Without them, plans use topics from your uploaded notes.
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="exam-pattern">Exam pattern</Label>
            <Textarea
              id="exam-pattern"
              name="pattern"
              rows={3}
              defaultValue={pattern}
              placeholder="3 hours. Part A: 10 short answers, 2 marks each. Part B: 5 of 7 numerical problems, 10 marks each."
              aria-describedby="exam-pattern-hint"
              aria-invalid={state.fieldErrors?.pattern ? true : undefined}
            />
            {state.fieldErrors?.pattern ? (
              <p id="exam-pattern-hint" className="text-sm text-destructive">
                {state.fieldErrors.pattern}
              </p>
            ) : (
              <p id="exam-pattern-hint" className="text-sm text-muted-foreground">
                Mock tests copy its style: question types, marks and level.
              </p>
            )}
          </div>
          <Field
            name="examDate"
            type="date"
            label="Exam date"
            defaultValue={examDate ?? ""}
            hint="Optional. Students see it as the suggested date for their plan."
            error={state.fieldErrors?.examDate}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
