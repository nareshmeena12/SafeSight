import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { FadeUp } from "@/components/motion/fade-up";
import { EmptyState } from "@/components/product/empty-state";
import { ModeBadge } from "@/components/product/mode-badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home" };

export default function StudentHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentHomeContent />
    </Suspense>
  );
}

const dueFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

async function StudentHomeContent() {
  const user = await requireRole(["student"]);
  const firstName = user.fullName.split(" ")[0];

  // Row-level security limits both queries to the student's own courses.
  const supabase = await createClient();
  const [{ data: courses }, { data: assignments }] = await Promise.all([
    supabase.from("courses").select("id, name, code").order("code"),
    supabase
      .from("assignments")
      .select("id, course_id, title, ai_mode, due_at")
      .order("due_at", { ascending: true, nullsFirst: false }),
  ]);

  return (
    <>
      <PageHeader
        title={firstName ? `Hi ${firstName}, welcome back` : "Welcome back"}
        description="Let's work through your courses together."
      />
      {!courses?.length ? (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="Your courses will appear here once you join one with your teacher's class code."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {courses.map((course, i) => {
            const list = (assignments ?? []).filter((a) => a.course_id === course.id);
            return (
              <FadeUp key={course.id} delay={i * 0.05}>
                <section className="h-full rounded-lg border bg-surface p-6" aria-labelledby={`course-${course.id}`}>
                  {course.code ? (
                    <p className="text-eyebrow text-muted-foreground uppercase">{course.code}</p>
                  ) : null}
                  <h2 id={`course-${course.id}`} className="mt-1 text-title">
                    {course.name}
                  </h2>
                  {list.length ? (
                    <ul className="mt-4 divide-y border-t">
                      {list.map((a) => (
                        <li key={a.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-label">{a.title}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-small text-muted-foreground">
                              <ModeBadge mode={a.ai_mode} />
                              {a.due_at ? <span>Due {dueFormat.format(new Date(a.due_at))}</span> : null}
                            </div>
                          </div>
                          {a.ai_mode !== "exam" ? (
                            <Button asChild variant="secondary" className="self-start sm:self-auto">
                              <Link href={`/student/sage/${a.id}`}>
                                Continue with Sage
                                <ArrowRight aria-hidden="true" />
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-small text-muted-foreground">Sage is off for exams</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-small text-muted-foreground">No assignments yet.</p>
                  )}
                </section>
              </FadeUp>
            );
          })}
        </div>
      )}
    </>
  );
}
