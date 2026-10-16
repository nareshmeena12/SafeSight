import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="font-serif text-headline-sm">Welcome back</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Log in to continue with your courses.
      </p>
      <Suspense fallback={<LoginForm />}>
        <LoginFormWithNext searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LoginFormWithNext({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const { next, error } = await searchParams;
  return (
    <>
      {error === "confirm" ? (
        <p role="alert" className="mb-5 text-sm text-destructive">
          That link has expired or was already used. Please log in, or sign up again.
        </p>
      ) : null}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </>
  );
}
