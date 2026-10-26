import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/signup-form";
import { ssoProviders } from "@/lib/auth/sso";
import type { SsoProvider } from "@/lib/auth/sso-shared";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <Suspense fallback={<SignupForm />}>
      <PrefilledSignup searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * A class-list invite links here with the student's email and the class code
 * filled in; a staff invite (S25) with the email, teacher role and institution.
 */
async function PrefilledSignup({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 254) : undefined);
  const email = one(params.email);
  const code = one(params.code)?.toUpperCase();
  const enabled = await ssoProviders();
  return (
    <SignupForm
      defaultRole={params.role === "teacher" ? "teacher" : "student"}
      sso={(Object.keys(enabled) as SsoProvider[]).filter((p) => enabled[p])}
      defaults={{
        email: email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : undefined,
        joinCode: code && /^[A-Z0-9]{6}$/.test(code) ? code : undefined,
        institution: one(params.institution)?.slice(0, 200),
      }}
    />
  );
}
