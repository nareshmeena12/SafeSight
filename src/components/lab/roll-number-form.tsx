"use client";

import { useActionState } from "react";
import { Field } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { saveRollNumber } from "@/lib/lab/actions";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

/** The roll number a student types on lab PCs, so lab summaries reach their account. */
export function RollNumberForm({ value }: { value: string | null }) {
  const [state, action, pending] = useActionState(saveRollNumber, initial);
  return (
    <form action={action} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="grow">
        <Field
          name="rollNumber"
          label="Your roll number"
          defaultValue={value ?? ""}
          placeholder="ME23B014"
          autoComplete="off"
          maxLength={32}
          error={state.fieldErrors?.rollNumber ?? (state.status === "error" ? state.message : undefined)}
          hint={state.status === "success" ? state.message : "Type it exactly as you do on lab PCs."}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="sm:mb-7">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
