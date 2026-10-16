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
import { saveCourse } from "@/lib/teacher/actions";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

/** Create a course, or rename one when `course` is given. */
export function CourseDialog({
  course,
  trigger,
}: {
  course?: { id: string; name: string; code: string };
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveCourse(prev, formData);
    // Close after a successful save (creating a course navigates away instead).
    if (result.status === "success") setOpen(false);
    return result;
  }, initial);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{course ? "Edit course" : "New course"}</DialogTitle>
          <DialogDescription>
            {course
              ? "Change the name or code your students see."
              : "Students join with a 6-character code you can share in class."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="grid gap-5">
          {course ? <input type="hidden" name="courseId" value={course.id} /> : null}
          <FormMessage message={state.status === "error" ? state.message : undefined} />
          <Field
            name="name"
            label="Course name"
            placeholder="Thermodynamics"
            defaultValue={course?.name}
            required
            error={state.fieldErrors?.name}
          />
          <Field
            name="code"
            label="Course code"
            placeholder="ME201"
            hint="Optional. Shown next to the name."
            defaultValue={course?.code}
            error={state.fieldErrors?.code}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : course ? "Save changes" : "Create course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
