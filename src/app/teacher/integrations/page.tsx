import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, FileSpreadsheet, GraduationCap, KeyRound, School } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/dal";
import { classroomConfig } from "@/lib/integrations/google";
import { moodleConfig } from "@/lib/integrations/moodle";

export const metadata: Metadata = { title: "Import classes" };

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <IntegrationsContent />
    </Suspense>
  );
}

function Card({
  href,
  icon: Icon,
  title,
  text,
  status,
}: {
  href: string;
  icon: typeof School;
  title: string;
  text: string;
  status: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full flex-col gap-4 rounded-lg border bg-surface p-6 transition-colors duration-150 ease-out hover:border-border-strong"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <ArrowRight
            className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0">
          <h2 className="text-title">{title}</h2>
          <p className="mt-1 text-small text-muted-foreground">{text}</p>
        </div>
        <div className="mt-auto">{status}</div>
      </Link>
    </li>
  );
}

async function IntegrationsContent() {
  const user = await requireRole(["teacher", "admin"]);
  const classroom = classroomConfig() !== null;
  const moodleApi = moodleConfig() !== null;

  return (
    <>
      <PageHeader
        eyebrow="Courses"
        title="Import your classes"
        description="Bring courses and class lists in from Google Classroom or Moodle. Students who already use SafeSight join at once; everyone else is invited with the email your LMS has."
      />
      <ul className="grid gap-4 md:grid-cols-2">
        <Card
          href="/teacher/integrations/google"
          icon={School}
          title="Google Classroom"
          text="Connect your Google account, pick a class you teach and import it with its students."
          status={classroom ? <Badge variant="good">Ready</Badge> : <Badge variant="secondary">Not configured yet</Badge>}
        />
        <Card
          href="/teacher/integrations/moodle"
          icon={GraduationCap}
          title="Moodle"
          text={
            moodleApi
              ? "Pick a Moodle course you teach, or upload Moodle's participants CSV."
              : "Upload the participants CSV from your Moodle course. Direct import needs your college's Moodle set up."
          }
          status={moodleApi ? <Badge variant="good">Connected to your college&apos;s Moodle</Badge> : <Badge variant="secondary">CSV upload</Badge>}
        />
        <Card
          href="/teacher/courses"
          icon={FileSpreadsheet}
          title="Any class list"
          text="Every course has an “Invite students” page that reads a CSV or rows pasted from a spreadsheet."
          status={<Badge variant="secondary">Name, email, roll number</Badge>}
        />
        {user.role === "admin" ? (
          <Card
            href="/teacher/institution"
            icon={KeyRound}
            title="Sign-in and email domains"
            text="Google and Microsoft sign-in, your college's email domains, and inviting teachers."
            status={<Badge variant="secondary">Admins</Badge>}
          />
        ) : null}
      </ul>
    </>
  );
}
