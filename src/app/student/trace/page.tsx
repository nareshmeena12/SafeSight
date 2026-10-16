import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, NotebookPen } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { ModeBadge } from "@/components/product/mode-badge";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { listStudentWriting } from "@/lib/trace/queries";
import { TRACE_TIME_ZONE } from "@/lib/trace/summary";

export const metadata: Metadata = { title: "Writing" };

const dueFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TRACE_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default function StudentWritingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentWriting />
    </Suspense>
  );
}

async function StudentWriting() {
  const user = await requireRole(["student"]);
  const items = await listStudentWriting(await createClient(), user.id);

  return (
    <>
      <PageHeader
        eyebrow="Trace"
        title="Your writing"
        description="Write your answers in Trace. It saves as you go and records how your work comes together, so your teacher sees your process, not just the result."
      />
      {items.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No assignments yet"
          description="Assignments from your courses will appear here, ready to write in Trace."
        />
      ) : (
        <ul className="grid gap-3">
          {items.map((a) => {
            const status = a.submission?.submitted_at
              ? { label: "Submitted", variant: "good" as const, action: "View" }
              : a.submission
                ? { label: "Draft", variant: "warning" as const, action: "Continue writing" }
                : { label: "Not started", variant: "secondary" as const, action: "Write in Trace" };
            return (
              <li key={a.id}>
                <Link
                  href={`/student/trace/${a.id}`}
                  className="group flex flex-col gap-3 rounded-lg border bg-surface p-4 transition-colors duration-150 ease-out hover:border-border-strong sm:flex-row sm:items-center sm:justify-between sm:p-6"
                >
                  <div className="min-w-0">
                    <p className="text-small text-muted-foreground">
                      {a.course?.code ? `${a.course.code} · ` : ""}
                      {a.course?.name}
                    </p>
                    <p className="text-title">{a.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ModeBadge mode={a.ai_mode} />
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {a.due_at ? (
                        <span className="text-small text-muted-foreground">
                          Due <time dateTime={a.due_at}>{dueFormat.format(new Date(a.due_at))}</time>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="inline-flex min-h-11 items-center gap-2 text-label text-primary">
                    {status.action}
                    <ArrowRight
                      className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
