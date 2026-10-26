import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, FileText } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { UploadForm } from "@/components/materials/upload-form";
import { RelinkNotes } from "@/components/setup/relink-notes";
import { SetupChecklist } from "@/components/setup/setup-checklist";
import { SuggestionsPanel } from "@/components/setup/suggestions-panel";
import { SyllabusInput } from "@/components/setup/syllabus-input";
import { TopicMapSection } from "@/components/setup/topic-map-section";
import { Badge } from "@/components/ui/badge";
import { aiStatus } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/dal";
import { setupSteps } from "@/lib/setup/checklist";
import { readSyllabusRow, readTopicMap, setupProgress, teacherCourse } from "@/lib/setup/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Course setup" };

export default function CourseSetupPage({ params }: PageProps<"/teacher/courses/[courseId]/setup">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SetupContent params={params} />
    </Suspense>
  );
}

const statusBadge = {
  ready: { variant: "good", label: "Ready" },
  processing: { variant: "warning", label: "Reading" },
  failed: { variant: "critical", label: "Needs attention" },
} as const;

async function SetupContent({ params }: Pick<PageProps<"/teacher/courses/[courseId]/setup">, "params">) {
  const user = await requireRole(["teacher", "admin"]);
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  const db = await createClient();
  const course = await teacherCourse(db, user.id, courseId);
  if (!course) notFound();

  const [map, syllabus, progress, { data: materials }] = await Promise.all([
    readTopicMap(db, course.id),
    readSyllabusRow(db, course.id),
    setupProgress(db, course.id),
    db.from("materials").select("id, title, status, page_count").eq("course_id", course.id).order("created_at", { ascending: false }),
  ]);
  const ai = aiStatus().chat;
  const draft =
    syllabus?.extracted && syllabus.extractedAt && (!syllabus.appliedAt || syllabus.extractedAt > syllabus.appliedAt)
      ? syllabus.extracted
      : null;
  const linkedTopics = Object.keys(map.notes).length;
  const topicCount = map.units.reduce((n, u) => n + u.topics.length, 0);

  return (
    <>
      <Link
        href={`/teacher/courses/${course.id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        {course.name}
      </Link>
      <PageHeader
        eyebrow={course.code || "Course setup"}
        title="Syllabus and topics"
        description="Turn your syllabus into a topic map, link your notes to it and pick a first assignment."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6 lg:col-span-8">
          <SyllabusInput courseId={course.id} hasMap={map.units.length > 0} aiReady={ai} />
          <TopicMapSection
            courseId={course.id}
            course={{ name: course.name, code: course.code }}
            saved={map}
            draft={draft}
            draftFrom={syllabus?.source === "pdf" && syllabus.fileName ? `“${syllabus.fileName}”` : "the syllabus you pasted"}
            draftKey={syllabus?.extractedAt ?? "none"}
          />
          <SuggestionsPanel courseId={course.id} suggestions={syllabus?.suggestions ?? []} hasMap={map.units.length > 0} aiReady={ai} />
        </div>
        <div className="grid min-w-0 grid-cols-1 content-start gap-6 lg:col-span-4">
          <SetupChecklist steps={setupSteps(course.id, progress)} compact />
          <section id="notes" aria-labelledby="notes-title" className="grid scroll-mt-24 gap-4">
            <div>
              <h2 id="notes-title" className="text-title">
                Notes for this course
              </h2>
              <p className="text-small text-muted-foreground">
                Sage searches them and cites the page. They&apos;re linked to topics by the words they share.
              </p>
            </div>
            <UploadForm courses={[{ id: course.id, label: course.code ? `${course.code} · ${course.name}` : course.name }]} />
            {materials?.length ? (
              <ul className="divide-y rounded-lg border bg-surface">
                {materials.map((m) => {
                  const status = statusBadge[m.status as keyof typeof statusBadge] ?? statusBadge.processing;
                  return (
                    <li key={m.id} className="flex items-start gap-3 p-4">
                      <FileText className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-label">{m.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-small text-muted-foreground">
                          <Badge variant={status.variant}>{status.label}</Badge>
                          {m.page_count ? <span className="font-mono">{m.page_count} pages</span> : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-small text-muted-foreground">No notes yet.</p>
            )}
            {topicCount ? (
              <div className="grid gap-2">
                <p className="text-small text-muted-foreground">
                  {linkedTopics} of {topicCount} topics have linked notes. Link again after adding new notes.
                </p>
                <RelinkNotes courseId={course.id} disabled={!materials?.length} />
              </div>
            ) : null}
            <Link href="/teacher/materials" className="text-small text-primary underline-offset-4 hover:underline">
              Manage all notes and PDFs
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
