import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
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
    <>
      <PageHeader
        title={firstName ? `Hi ${firstName}, welcome back` : "Welcome back"}
        description="Let's work through your courses together."
      />
      <EmptyState
        icon={BookOpen}
        title="No courses yet"
        description="Your courses will appear here once you join one with your teacher's class code."
      />
    </>
  );
}
