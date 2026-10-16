"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/schemas";
import { Field, FormMessage } from "./field";

const initial: AuthFormState = { status: "idle" };

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <form action={action} noValidate className="grid gap-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormMessage message={state.message} />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        error={state.fieldErrors?.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New to SafeSight?{" "}
        <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
