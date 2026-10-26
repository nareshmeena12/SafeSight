import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, School } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { LmsImportForm } from "@/components/integrations/lms-import-form";
import { RosterPreview } from "@/components/integrations/roster-preview";
import { SetupSteps } from "@/components/integrations/setup-steps";
import { EmptyState } from "@/components/product/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { emailConfigured } from "@/lib/email/send";
import { disconnectClassroomAction, importFromClassroom } from "@/lib/integrations/actions";
import {
  classroomConfig,
  classroomCourseIfTeacher,
  classroomToken,
  listClassroomCourses,
  listClassroomStudents,
} from "@/lib/integrations/google";
import { LmsError } from "@/lib/integrations/http";
import { linkedCourses } from "@/lib/integrations/import";
import { classroomCourseLabel, classroomRoster, type ClassroomCourse } from "@/lib/integrations/lms";
import { createClient } from "@/lib/supabase/server";
import { listCourses } from "@/lib/teacher/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Google Classroom" };

const connectErrors: Record<string, string> = {
  cancelled: "Connecting was cancelled. You can try again whenever you're ready.",
  scopes: "Google didn't give SafeSight permission to read your classes. Connect again and tick the Classroom boxes.",
  failed: "We couldn't connect to Google Classroom just now. Please try again.",
};

export default function GoogleClassroomPage({ searchParams }: PageProps<"/teacher/integrations/google">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

function Back() {
  return (
    <Link href="/teacher/integrations" className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
      Import classes
    </Link>
  );
}

function ConnectCard({ error, again }: { error?: string; again?: boolean }) {
  return (
    <section className="grid max-w-2xl gap-4 rounded-lg border bg-surface p-6" aria-labelledby="connect-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          <School className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="connect-title" className="text-title">
            {again ? "Connect Google Classroom again" : "Connect Google Classroom"}
          </h2>
          <p className="text-small text-muted-foreground">
            SafeSight asks Google to read the classes you teach and their students&apos; names and emails. It can&apos;t change anything in
            Classroom. The connection lasts about an hour and isn&apos;t stored.
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-small text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button asChild>
          <a href="/api/integrations/google/start">Connect with Google</a>
        </Button>
      </div>
    </section>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/teacher/integrations/google">, "searchParams">) {
  const user = await requireRole(["teacher", "admin"]);
  const params = await searchParams;
  const selected = typeof params.class === "string" ? params.class : undefined;
  const error = typeof params.error === "string" ? connectErrors[params.error] : undefined;
  const cfg = classroomConfig();

  const header = (
    <>
      <Back />
      <PageHeader
        eyebrow="Import"
        title="Google Classroom"
        description="Pick a class you teach. SafeSight makes the course (or fills one you have) and invites its students."
      />
    </>
  );

  if (!cfg) {
    return (
      <>
        {header}
        <SetupSteps
          title="Google Classroom isn't configured yet"
          description="Whoever runs SafeSight for your college turns this on once. Until then, export the class list as CSV and use “Invite students” on the course."
          steps={[
            "Google Cloud console: enable the Google Classroom API for the project that has SafeSight's Google sign-in client.",
            "Add the Classroom scopes (courses.readonly, rosters.readonly, profile.emails) to the OAuth consent screen.",
            <>
              Add <code className="font-mono">/api/integrations/google/callback</code> on the site&apos;s address to the client&apos;s redirect URIs.
            </>,
            <>
              Set <code className="font-mono">GOOGLE_CLASSROOM_ENABLED=true</code>, <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
              <code className="font-mono">GOOGLE_CLIENT_SECRET</code> in the hosting settings and redeploy.
            </>,
          ]}
        />
      </>
    );
  }

  const token = await classroomToken(cfg, user.id);
  if (!token) {
    return (
      <>
        {header}
        <ConnectCard error={error} />
      </>
    );
  }

  const db = await createClient();
  let courses: ClassroomCourse[];
  try {
    courses = await listClassroomCourses(token);
  } catch (e) {
    const expired = e instanceof LmsError && e.status === 401;
    return (
      <>
        {header}
        <ConnectCard again error={expired ? "Your Google Classroom connection has expired." : "We couldn't read your Classroom classes just now. Please connect again."} />
      </>
    );
  }
  const [mine, links] = await Promise.all([listCourses(db, user.id), linkedCourses(db, "google_classroom")]);
  const current = selected ? courses.find((c) => c.id === selected) : undefined;

  return (
    <>
      {header}
      {courses.length === 0 ? (
        <EmptyState
          icon={School}
          title="No active Classroom classes"
          description="We only list active classes where you're a teacher. Check you connected the Google account you teach with."
          action={
            <form action={disconnectClassroomAction}>
              <Button type="submit" variant="outline">
                Use another Google account
              </Button>
            </form>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <section className="min-w-0 lg:col-span-5" aria-labelledby="classes-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="classes-title" className="text-title">
                Your classes
              </h2>
              <form action={disconnectClassroomAction}>
                <Button type="submit" variant="ghost">
                  Disconnect
                </Button>
              </form>
            </div>
            <ul className="grid gap-2">
              {courses.map((c) => {
                const link = links.get(c.id);
                const active = c.id === current?.id;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/teacher/integrations/google?class=${encodeURIComponent(c.id)}`}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex min-h-11 flex-col gap-1 rounded-md border bg-surface px-4 py-3 transition-colors duration-150 ease-out hover:border-border-strong",
                        active && "border-primary bg-primary-soft",
                      )}
                    >
                      <span className="text-label">{classroomCourseLabel(c)}</span>
                      {link ? <span className="text-small text-muted-foreground">Imported into {link.courseName}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="min-w-0 lg:col-span-7" aria-label="Import">
            {current ? (
              <Suspense fallback={<div className="h-64 animate-pulse rounded-lg border bg-surface" />}>
                <ClassPanel token={token} course={current} mine={mine.map((m) => ({ id: m.id, name: m.name }))} linkedId={links.get(current.id)?.courseId} />
              </Suspense>
            ) : (
              <EmptyState icon={School} title="Pick a class" description="Its students show here before anything is imported." />
            )}
          </section>
        </div>
      )}
    </>
  );
}

async function ClassPanel({
  token,
  course,
  mine,
  linkedId,
}: {
  token: string;
  course: ClassroomCourse;
  mine: { id: string; name: string }[];
  linkedId?: string;
}) {
  let roster = null;
  let failed = false;
  try {
    const checked = await classroomCourseIfTeacher(token, course.id);
    if (checked) roster = classroomRoster(await listClassroomStudents(token, course.id));
  } catch {
    failed = true;
  }
  if (!failed && !roster) {
    return <p className="rounded-lg border bg-surface p-6 text-small">Only a teacher of this class can import it.</p>;
  }
  if (!roster) {
    return (
      <p role="alert" className="rounded-lg border bg-surface p-6 text-small text-destructive">
        We couldn&apos;t read this class&apos;s students just now. Please reload the page.
      </p>
    );
  }
  return (
    <div className="grid gap-6 rounded-lg border bg-surface p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-title">{classroomCourseLabel(course)}</h2>
        {linkedId ? <Badge variant="secondary">Imported before</Badge> : null}
      </div>
      <RosterPreview roster={roster} />
      <LmsImportForm
        action={importFromClassroom}
        externalId={course.id}
        courses={mine}
        defaultTarget={linkedId}
        defaultName={course.name}
        studentCount={roster.rows.length}
        emailReady={emailConfigured()}
      />
    </div>
  );
}
