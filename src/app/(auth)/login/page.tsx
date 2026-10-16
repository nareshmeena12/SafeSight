import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<LoginForm />}>
      <LoginFormWithParams searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginFormWithParams({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const { next, error } = await searchParams;
  return (
    <LoginForm
      next={typeof next === "string" ? next : undefined}
      notice={
        error === "confirm"
          ? "That link has expired or was already used. Please log in, or ask for a new link."
          : undefined
      }
    />
  );
}
