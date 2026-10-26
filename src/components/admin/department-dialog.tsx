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
import { saveDepartment } from "@/lib/admin/actions";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

/** Create a department, or rename one when `department` is given. */
export function DepartmentDialog({
  department,
  trigger,
}: {
  department?: { id: string; name: string; code: string };
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveDepartment(prev, formData);
    // Creating navigates to the new department instead.
    if (result.status === "success") setOpen(false);
    return result;
  }, initial);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? "Edit department" : "New department"}</DialogTitle>
          <DialogDescription>
            {department
              ? "Change the name or code teachers see."
              : "Each department can have its own AI policy. Add teachers to it next."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="grid gap-5">
          {department ? <input type="hidden" name="departmentId" value={department.id} /> : null}
          <FormMessage message={state.status === "error" ? state.message : undefined} />
          <Field
            name="name"
            label="Department name"
            placeholder="Mechanical Engineering"
            defaultValue={department?.name}
            required
            error={state.fieldErrors?.name}
          />
          <Field
            name="code"
            label="Short code"
            placeholder="ME"
            hint="Optional. Shown next to the name."
            defaultValue={department?.code}
            error={state.fieldErrors?.code}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : department ? "Save changes" : "Create department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
