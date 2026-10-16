import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/app-header";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Home" };

export default function StudentHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentHomeContent />
    </Suspense>
  );
}

async function StudentHomeContent() {
  const user = await requireRole(["student"]);
  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {firstName ? `Hi ${firstName}, welcome back` : "Welcome back"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Let&apos;s work through your courses together.
        </p>
      </div>
      <section className="rounded-2xl border border-dashed p-8 text-center">
        <h2 className="font-medium">No courses yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your courses will appear here once you join one with your teacher&apos;s class code.
        </p>
      </section>
    </div>
  );
}
