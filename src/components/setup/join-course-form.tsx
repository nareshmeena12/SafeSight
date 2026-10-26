"use client";

import { useActionState } from "react";
import { Field, FormMessage } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { joinWithCode } from "@/lib/setup/join-actions";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

export function JoinCourseForm({ code }: { code?: string }) {
  const [state, action, pending] = useActionState(joinWithCode, initial);
  return (
    <form action={action} noValidate className="grid gap-4 rounded-lg border bg-surface p-6">
      <FormMessage message={state.status === "error" ? state.message : undefined} />
      <Field
        name="code"
        label="Class code"
        defaultValue={code}
        placeholder="THRM01"
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={12}
        className="font-mono uppercase tracking-[0.2em]"
        error={state.fieldErrors?.code}
        hint="Your teacher shares this code in class or in the class group."
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Joining…" : "Join course"}
        </Button>
      </div>
    </form>
  );
}
