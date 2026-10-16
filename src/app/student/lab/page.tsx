import type { Metadata } from "next";
import { Suspense } from "react";
import { MonitorCheck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { dayTime } from "@/components/lab/format";
import { RollNumberForm } from "@/components/lab/roll-number-form";
import { EmptyState } from "@/components/product/empty-state";
import { requireRole } from "@/lib/auth/dal";
import { listMyLabSeats } from "@/lib/lab/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lab sessions" };

export default function StudentLabPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentLabContent />
    </Suspense>
  );
}

async function StudentLabContent() {
  const user = await requireRole(["student"]);
  const db = await createClient();
  const [{ data: profile }, seats] = await Promise.all([
    db.from("profiles").select("roll_number").eq("id", user.id).maybeSingle(),
    listMyLabSeats(db, user.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Lab sessions"
        title="Your lab exams"
        description="During a lab exam the SafeSight Lab extension records tab switches, moves to other apps, copy and paste counts (never the text), blocked sites and idle time. Here is what it recorded for you, the same summary your teacher sees."
      />
      <section aria-labelledby="roll" className="mb-10 rounded-lg border bg-surface p-6">
        <h2 id="roll" className="mb-1 text-title">
          Link your roll number
        </h2>
        <p className="mb-4 text-small text-muted-foreground">
          Lab PCs ask for your roll number, not your SafeSight login. Save it here so your lab summaries show up on this
          page.
        </p>
        <RollNumberForm value={profile?.roll_number ?? null} />
      </section>

      {seats.length === 0 ? (
        <EmptyState
          icon={MonitorCheck}
          title="No lab sessions yet"
          description="After a lab exam with SafeSight, its summary appears here."
        />
      ) : (
        <ul className="grid gap-3">
          {seats.map((s) => (
            <li key={s.seatId} className="rounded-lg border bg-surface p-4 sm:p-6">
              <h2 className="text-title">{s.title}</h2>
              <p className="mt-1 text-small text-muted-foreground">
                {[s.course, s.startsAt ? dayTime.format(new Date(s.startsAt)) : null, `Seat ${s.seatLabel}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-3 max-w-3xl">{s.summary ?? "Your summary is ready once the session ends."}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
