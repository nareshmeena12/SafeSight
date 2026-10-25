import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { SageChat, type SageChatTarget } from "@/components/sage/sage-chat";
import { aiStatus } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/dal";
import { previewToUI, readPreview } from "@/lib/sage/preview";
import { createClient } from "@/lib/supabase/server";
import { getCourseDetail } from "@/lib/teacher/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Preview Sage" };

/**
 * Preview Sage: the teacher chats with Sage on one of their assignments (or
 * in Explore for the course) and gets exactly the replies a student would.
 * Preview chats live apart from student chats and never count in any metric.
 */
export default function PreviewSagePage({ params, searchParams }: PageProps<"/teacher/courses/[courseId]/preview">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PreviewContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PreviewContent({ params, searchParams }: PageProps<"/teacher/courses/[courseId]/preview">) {
  const user = await requireRole(["teacher", "admin"]);
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  const detail = await getCourseDetail(await createClient(), user.id, courseId);
  if (!detail) notFound();
  const { course, assignments } = detail;

  const { assignment: asked } = await searchParams;
  const selected = typeof asked === "string" ? (assignments.find((a) => a.id === asked) ?? null) : null;

  // Ownership was checked above (getCourseDetail is scoped to the teacher's courses).
  const chat = await readPreview({ teacherId: user.id, courseId: course.id, assignmentId: selected?.id ?? null });
  const courseName = course.code ? `${course.code} ${course.name}` : course.name;
  const target: SageChatTarget = selected
    ? { kind: "assignment", assignmentId: selected.id, title: selected.title, mode: selected.aiMode }
    : { kind: "explore", courseId: course.id, courseName };

  const options = [
    { key: "explore", href: `/teacher/courses/${course.id}/preview`, label: "Ask Sage (Explore)", active: !selected },
    ...assignments.map((a) => ({
      key: a.id,
      href: `/teacher/courses/${course.id}/preview?assignment=${a.id}`,
      label: a.title,
      active: a.id === selected?.id,
    })),
  ];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href={`/teacher/courses/${course.id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        {course.name}
      </Link>
      <PageHeader
        className="mb-6 lg:mb-8"
        eyebrow={`Preview · ${courseName}`}
        title={selected ? selected.title : "Ask Sage"}
        description={
          selected
            ? "Chat as a student would on this assignment. Sage uses its mode, your answer key, the highest hint step and the worked-examples setting."
            : "Chat as a student would in Explore. General questions get full explanations; anything that matches an active assignment follows that assignment's rule."
        }
      />
      <nav aria-label="What to preview" className="mb-6 flex flex-wrap gap-2">
        {options.map((o) => (
          <Link
            key={o.key}
            href={o.href}
            aria-current={o.active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 max-w-full items-center rounded-full border px-4 text-label transition-colors duration-150 ease-out",
              o.active ? "border-primary bg-primary-soft text-foreground" : "text-muted-foreground hover:bg-hover",
            )}
          >
            <span className="truncate">{o.label}</span>
          </Link>
        ))}
      </nav>
      <SageChat
        key={selected?.id ?? "explore"}
        preview
        target={target}
        studentFirstName={user.fullName.split(" ")[0] ?? ""}
        initialConversationId={chat.id}
        initialMessages={previewToUI(chat)}
        available={selected?.aiMode === "exam" || aiStatus().chat}
      />
    </div>
  );
}
