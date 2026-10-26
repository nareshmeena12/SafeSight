import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BookOpen, NotebookPen } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { DoubtNotices } from "@/components/doubts/doubt-notices";
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
  const now = new Date().getTime();
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
      {/* S21: an answer from a teacher (or a TA invite) waiting to be read. */}
      <DoubtNotices />
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
            const upcoming = list.filter((a) => !a.due_at || Date.parse(a.due_at) >= now);
            const earlier = list.filter((a) => a.due_at && Date.parse(a.due_at) < now).reverse();
            return (
              <FadeUp key={course.id} delay={i * 0.05}>
                <section className="h-full rounded-lg border bg-surface p-6" aria-labelledby={`course-${course.id}`}>
                  {course.code ? (
                    <p className="text-eyebrow text-muted-foreground uppercase">{course.code}</p>
                  ) : null}
                  <h2 id={`course-${course.id}`} className="mt-1 text-title">
                    {course.name}
                  </h2>
                  {upcoming.length ? (
                    <ul className="mt-4 divide-y border-t">
                      {upcoming.map((a) => (
                        <li key={a.id} className="flex flex-col gap-3 py-4">
                          <div className="min-w-0">
                            <p className="text-label">{a.title}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-small text-muted-foreground">
                              <ModeBadge mode={a.ai_mode} />
                              {a.due_at ? <span>Due {dueFormat.format(new Date(a.due_at))}</span> : null}
                            </div>
                          </div>
                          {a.ai_mode !== "exam" ? (
                            <div className="flex flex-wrap gap-2">
                              <Button asChild variant="secondary">
                                <Link href={`/student/sage/${a.id}`}>
                                  Continue with Sage
                                  <ArrowRight aria-hidden="true" />
                                </Link>
                              </Button>
                              <Button asChild variant="ghost">
                                <Link href={`/student/trace/${a.id}`}>
                                  <NotebookPen aria-hidden="true" />
                                  Write in Trace
                                </Link>
                              </Button>
                            </div>
                          ) : (
                            <span className="text-small text-muted-foreground">Sage is off for exams. All the best!</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-small text-muted-foreground">Nothing due right now. Enjoy the breather.</p>
                  )}
                  {earlier.length ? (
                    <details className="group mt-2 border-t pt-2">
                      <summary className="flex min-h-11 cursor-pointer items-center text-small text-muted-foreground hover:text-foreground">
                        Earlier work ({earlier.length})
                      </summary>
                      <ul className="grid gap-1 pb-2">
                        {earlier.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3">
                            <span className="text-small">{a.title}</span>
                            {a.ai_mode !== "exam" ? (
                              <Link
                                href={`/student/sage/${a.id}`}
                                className="inline-flex min-h-11 items-center text-small text-primary hover:underline"
                              >
                                Review with Sage
                              </Link>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </section>
              </FadeUp>
            );
          })}
        </div>
      )}
    </>
  );
}
