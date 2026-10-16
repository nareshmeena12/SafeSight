import type { Metadata } from "next";
import { Suspense } from "react";
import { Library } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
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
    <>
      <PageHeader
        eyebrow="Overview"
        title={user.fullName ? `Welcome, ${user.fullName}` : "Welcome"}
        description="Here's where you'll see how your class learns with Sage."
      />
      <EmptyState
        icon={Library}
        title="No courses yet"
        description="Create your first course to invite students and set an AI mode for each assignment."
      />
    </>
  );
}
