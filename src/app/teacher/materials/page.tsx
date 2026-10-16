import type { Metadata } from "next";
import { Suspense } from "react";
import { FileText, Library } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { MaterialActions } from "@/components/materials/material-actions";
import { UploadForm } from "@/components/materials/upload-form";
import { EmptyState } from "@/components/product/empty-state";
import { Badge } from "@/components/ui/badge";
import { aiStatus } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Course materials" };

export default function MaterialsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MaterialsContent />
    </Suspense>
  );
}

const statusBadge = {
  ready: { variant: "good", label: "Ready" },
  processing: { variant: "warning", label: "Reading" },
  failed: { variant: "critical", label: "Needs attention" },
} as const;

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

async function MaterialsContent() {
  const user = await requireRole(["teacher", "admin"]);
  const supabase = await createClient();
  const [{ data: courses }, { data: materials }] = await Promise.all([
    supabase.from("courses").select("id, name, code").eq("teacher_id", user.id).order("code"),
    supabase
      .from("materials")
      .select("id, title, status, page_count, error, created_at, course_id, courses!inner(teacher_id)")
      .eq("courses.teacher_id", user.id)
      .order("created_at", { ascending: false }),
  ]);
  const vectors = aiStatus().embeddings;

  return (
    <>
      <PageHeader
        eyebrow="Courses"
        title="Course materials"
        description="Upload lecture notes and PDFs. Sage searches them when students ask questions and cites the page it used."
      />
      {!courses?.length ? (
        <EmptyState
          icon={Library}
          title="No courses yet"
          description="Create a course first, then come back to add its notes."
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <UploadForm courses={courses.map((c) => ({ id: c.id, label: c.code ? `${c.code} · ${c.name}` : c.name }))} />
            {!vectors ? (
              <p className="mt-3 text-small text-muted-foreground">
                Search currently matches keywords. Smarter search turns on once an embedding model is set up; then use
                “Read again” on each file.
              </p>
            ) : null}
          </div>
          <div className="lg:col-span-7">
            {courses.map((course) => {
              const list = (materials ?? []).filter((m) => m.course_id === course.id);
              return (
                <section key={course.id} className="mb-8 last:mb-0" aria-labelledby={`materials-${course.id}`}>
                  <h2 id={`materials-${course.id}`} className="mb-3 text-title">
                    {course.code ? `${course.code} · ` : ""}
                    {course.name}
                  </h2>
                  {list.length ? (
                    <ul className="divide-y rounded-lg border bg-surface">
                      {list.map((m) => {
                        const status = statusBadge[m.status as keyof typeof statusBadge] ?? statusBadge.processing;
                        return (
                          <li key={m.id} className="flex items-start gap-3 p-4">
                            <FileText className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-label">{m.title}</p>
                              <p className="mt-1 flex flex-wrap items-center gap-2 text-small text-muted-foreground">
                                <Badge variant={status.variant}>{status.label}</Badge>
                                {m.page_count ? <span className="font-mono">{m.page_count} pages</span> : null}
                                <span>Added {dateFormat.format(new Date(m.created_at))}</span>
                              </p>
                              {m.status === "failed" && m.error ? (
                                <p className="mt-2 text-small text-muted-foreground">{m.error}</p>
                              ) : null}
                            </div>
                            <MaterialActions id={m.id} title={m.title} />
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-dashed p-4 text-small text-muted-foreground">
                      No notes yet. Upload a PDF and Sage will use it for this course.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
