import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Info } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { DigestPreview } from "@/components/brief/digest-preview";
import { WeeklyEmailToggle } from "@/components/brief/weekly-email-toggle";
import { requireRole } from "@/lib/auth/dal";
import { buildDigest, lastDigest, weeklyEmailWanted } from "@/lib/digest/digest";
import { emailConfigured } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatShortDate } from "@/lib/teacher/dates";

export const metadata: Metadata = { title: "Weekly digest" };

export default function DigestPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DigestContent />
    </Suspense>
  );
}

const statusText = {
  sent: "Emailed",
  not_configured: "Shown here only (email isn't set up yet)",
  opted_out: "Not emailed (you turned email off)",
  failed: "The email didn't go through",
} as const;

async function DigestContent() {
  const user = await requireRole(["teacher", "admin"]);
  const db = await createClient();
  const [content, wanted, last] = await Promise.all([buildDigest(db, user.id), weeklyEmailWanted(db, user.id), lastDigest(db, user.id)]);
  const configured = emailConfigured();

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/teacher/brief" className="inline-flex min-h-11 items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            Brief
          </Link>
        }
        title="Weekly digest"
        description="Every Monday morning: this week's brief, flags and the Reliance Score trend for each of your courses."
      />
      <div className="grid gap-6">
        <section aria-labelledby="email-heading" className="grid gap-4 rounded-lg border bg-surface p-4 sm:p-6">
          <h2 id="email-heading" className="text-title">
            Email
          </h2>
          {configured ? (
            user.role === "teacher" ? (
              <WeeklyEmailToggle on={wanted} email={user.email} />
            ) : null
          ) : (
            <p className="flex items-start gap-2 rounded-md bg-primary-soft p-4 text-small">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
              Email isn&apos;t set up for SafeSight yet, so the digest is shown here only. It updates live; check it any time.
            </p>
          )}
          {last ? (
            <p className="text-small text-muted-foreground">
              Last Monday digest: week of {formatShortDate(last.week)} · {statusText[last.email_status as keyof typeof statusText] ?? last.email_status}
              {last.emailed_at ? `, ${formatDateTime(last.emailed_at)}` : ""}.
            </p>
          ) : null}
        </section>

        <DigestPreview content={content} />
      </div>
    </>
  );
}
