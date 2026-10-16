import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <>
      <h1 className="font-serif text-headline-sm">Create your account</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Pick the option that fits you. It shapes what you&apos;ll see in SafeSight.
      </p>
      <SignupForm />
    </>
  );
}
