import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { CsvImportForm } from "@/components/integrations/csv-import-form";
import { LmsImportForm } from "@/components/integrations/lms-import-form";
import { RosterPreview } from "@/components/integrations/roster-preview";
import { SetupSteps } from "@/components/integrations/setup-steps";
import { EmptyState } from "@/components/product/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/dal";
import { emailConfigured } from "@/lib/email/send";
import { importFromMoodle } from "@/lib/integrations/actions";
import { linkedCourses } from "@/lib/integrations/import";
import { moodleRoster, type MoodleCourse } from "@/lib/integrations/lms";
import { moodleConfig, moodleCourseForTeacher, moodleCoursesFor, type MoodleConfig } from "@/lib/integrations/moodle";
import { createClient } from "@/lib/supabase/server";
import { listCourses } from "@/lib/teacher/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Moodle" };

export default function MoodlePage({ searchParams }: PageProps<"/teacher/integrations/moodle">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/teacher/integrations/moodle">, "searchParams">) {
  const user = await requireRole(["teacher", "admin"]);
  const params = await searchParams;
  const selected = typeof params.course === "string" && /^\d{1,12}$/.test(params.course) ? Number(params.course) : undefined;
  const db = await createClient();
  const mine = (await listCourses(db, user.id)).map((c) => ({ id: c.id, name: c.name }));
  const cfg = moodleConfig();

  return (
    <>
      <Link href="/teacher/integrations" className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Import classes
      </Link>
      <PageHeader
        eyebrow="Import"
        title="Moodle"
        description="Import a Moodle course's students into SafeSight. Only students come across; teachers and other roles are left out."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-7">
          {cfg ? (
            <Suspense fallback={<div className="h-64 animate-pulse rounded-lg border bg-surface" />}>
              <ApiSection cfg={cfg} email={user.email} selected={selected} mine={mine} />
            </Suspense>
          ) : null}
          <section className="rounded-lg border bg-surface p-6">
            <CsvImportForm courses={mine} />
          </section>
        </div>
        <div className="grid min-w-0 content-start gap-6 lg:col-span-5">
          {cfg ? null : (
            <SetupSteps
              title="Direct Moodle import isn't configured yet"
              description="The CSV upload works now. To list your Moodle courses here instead, your college's Moodle admin sets up a web service once."
              steps={[
                "Moodle: Site administration → Server → Web services: enable web services and the REST protocol.",
                "Create a web service with core_user_get_users_by_field, core_enrol_get_users_courses and core_enrol_get_enrolled_users, and a token for a user allowed to use them.",
                <>
                  Set <code className="font-mono">MOODLE_URL</code> (e.g. https://moodle.college.edu.in) and <code className="font-mono">MOODLE_TOKEN</code> in the
                  hosting settings and redeploy.
                </>,
              ]}
            />
          )}
          <section className="rounded-lg border bg-surface p-6 text-small">
            <h2 className="text-title">How students join</h2>
            <p className="mt-1 text-muted-foreground">
              Students who already use SafeSight with the same email are added at once. Everyone else is invited and joins the course as soon as they
              sign up or sign in with that email, including with Google or Microsoft.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

async function ApiSection({
  cfg,
  email,
  selected,
  mine,
}: {
  cfg: MoodleConfig;
  email: string;
  selected?: number;
  mine: { id: string; name: string }[];
}) {
  let courses: MoodleCourse[];
  let found: boolean;
  try {
    const res = await moodleCoursesFor(cfg, email);
    courses = res.courses;
    found = res.moodleUserId !== null;
  } catch (e) {
    console.warn("moodle courses:", e instanceof Error ? e.message : e);
    return (
      <p role="alert" className="rounded-lg border bg-surface p-6 text-small text-destructive">
        We couldn&apos;t reach your college&apos;s Moodle just now. You can still upload its CSV export below.
      </p>
    );
  }
  if (!found || courses.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title={found ? "No Moodle courses yet" : "We couldn't find you on Moodle"}
        description={
          found
            ? "Your Moodle account isn't enrolled in any course. Upload a CSV export below instead."
            : `No Moodle account uses ${email}. Upload the course's CSV export below instead.`
        }
      />
    );
  }
  const links = await linkedCourses(await createClient(), "moodle");
  const current = selected ? courses.find((c) => c.id === selected) : undefined;

  return (
    <section className="grid gap-4 rounded-lg border bg-surface p-6" aria-labelledby="moodle-courses-title">
      <h2 id="moodle-courses-title" className="text-title">
        Your Moodle courses
      </h2>
      <ul className="grid gap-2">
        {courses.map((c) => {
          const link = links.get(String(c.id));
          const active = c.id === current?.id;
          return (
            <li key={c.id}>
              <Link
                href={`/teacher/integrations/moodle?course=${c.id}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-11 flex-col gap-1 rounded-md border bg-background px-4 py-3 transition-colors duration-150 ease-out hover:border-border-strong",
                  active && "border-primary bg-primary-soft",
                )}
              >
                <span className="text-label">{c.fullname}</span>
                <span className="text-small text-muted-foreground">
                  <span className="font-mono">{c.shortname}</span>
                  {link ? ` · Imported into ${link.courseName}` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {current ? <CoursePanel cfg={cfg} email={email} course={current} mine={mine} linkedId={links.get(String(current.id))?.courseId} /> : null}
    </section>
  );
}

async function CoursePanel({
  cfg,
  email,
  course,
  mine,
  linkedId,
}: {
  cfg: MoodleConfig;
  email: string;
  course: MoodleCourse;
  mine: { id: string; name: string }[];
  linkedId?: string;
}) {
  let result;
  try {
    result = await moodleCourseForTeacher(cfg, email, course.id);
  } catch {
    return (
      <p role="alert" className="text-small text-destructive">
        We couldn&apos;t read this course&apos;s participants just now. Please reload the page.
      </p>
    );
  }
  if (!result) return <p className="text-small text-muted-foreground">Only a teacher of this Moodle course can import it.</p>;
  const roster = moodleRoster(result.users);
  return (
    <div className="grid gap-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-label">{course.fullname}</h3>
        {linkedId ? <Badge variant="secondary">Imported before</Badge> : null}
      </div>
      <RosterPreview roster={roster} />
      <LmsImportForm
        action={importFromMoodle}
        externalId={String(course.id)}
        courses={mine}
        defaultTarget={linkedId}
        defaultName={course.fullname}
        defaultCode={course.shortname.length <= 32 ? course.shortname : ""}
        studentCount={roster.rows.length}
        emailReady={emailConfigured()}
      />
    </div>
  );
}
