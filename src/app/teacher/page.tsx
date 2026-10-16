import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/app-header";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Overview" };

export default function TeacherHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeacherHomeContent />
    </Suspense>
  );
}

async function TeacherHomeContent() {
  const user = await requireRole(["teacher", "admin"]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {user.fullName ? `Welcome, ${user.fullName}` : "Welcome"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Here&apos;s where you&apos;ll see how your class learns with Sage.
        </p>
      </div>
      <section className="rounded-2xl border border-dashed p-8 text-center">
        <h2 className="font-medium">No courses yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first course to invite students and set an AI mode for each assignment.
        </p>
      </section>
    </div>
  );
}
