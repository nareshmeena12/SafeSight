"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { signup } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/schemas";
import { Field, FormMessage } from "./field";

const initial: AuthFormState = { status: "idle" };

const roleOptions = [
  { value: "student", label: "Student", detail: "Learn with Sage in your courses" },
  { value: "teacher", label: "Teacher", detail: "Set up courses and see class insights" },
] as const;

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, initial);

  if (state.status === "check-email") {
    return (
      <div className="grid gap-3 text-center" role="status">
        <h2 className="text-xl font-semibold">Check your inbox</h2>
        <p className="text-muted-foreground">
          We sent a confirmation link to <strong className="text-foreground">{state.email}</strong>.
          The link works once.
        </p>
        <Link href="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="grid gap-5">
      <FormMessage message={state.message} />
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">I am a</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {roleOptions.map((option, i) => (
            <label
              key={option.value}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border bg-surface p-3 has-checked:border-primary has-checked:bg-primary-soft"
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                defaultChecked={i === 0}
                className="mt-1 accent-primary"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">{option.label}</span>
                <span className="text-sm text-muted-foreground">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
        {state.fieldErrors?.role ? (
          <p className="text-sm text-destructive">{state.fieldErrors.role}</p>
        ) : null}
      </fieldset>
      <Field
        name="fullName"
        label="Full name"
        autoComplete="name"
        required
        error={state.fieldErrors?.fullName}
      />
      <Field
        name="email"
        label="College email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        hint="Use your college email so we can connect you to your institution."
        error={state.fieldErrors?.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Student data is never used to train AI models.
      </p>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
