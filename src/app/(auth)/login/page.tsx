import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { ssoProviders } from "@/lib/auth/sso";
import { ssoErrors, type SsoProvider } from "@/lib/auth/sso-shared";

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
  const enabled = await ssoProviders();
  const sso = (Object.keys(enabled) as SsoProvider[]).filter((p) => enabled[p]);
  return (
    <LoginForm
      next={typeof next === "string" ? next : undefined}
      sso={sso}
      notice={
        error === "confirm"
          ? "That link has expired or was already used. Please log in, or ask for a new link."
          : typeof error === "string" && error in ssoErrors
            ? ssoErrors[error as keyof typeof ssoErrors]
            : undefined
      }
    />
  );
}
