import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NotebookPen } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { listCourseSubmissions } from "@/lib/trace/queries";
import { formatMinutesShort, formatPercent, TRACE_TIME_ZONE } from "@/lib/trace/summary";

export const metadata: Metadata = { title: "Submissions" };

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TRACE_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default function SubmissionsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Submissions />
    </Suspense>
  );
}

async function Submissions() {
  await requireRole(["teacher", "admin"]);
  const rows = await listCourseSubmissions(await createClient());

  return (
    <>
      <PageHeader
        eyebrow="Trace"
        title="Submissions"
        description="Work written in Trace. Open one to replay how it was written and read the evidence summary."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No submissions yet"
          description="When students submit work written in Trace, it appears here with a replay and a short summary."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Assignment</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Active time</TableHead>
                <TableHead className="text-right">Pasted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/teacher/submissions/${s.id}`}
                      className="inline-flex min-h-11 items-center text-label text-primary hover:underline"
                    >
                      {s.student?.full_name || "Student"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="block">{s.assignment?.title}</span>
                    <span className="text-small text-muted-foreground">{s.assignment?.course?.code}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.submitted_at ? (
                      <time dateTime={s.submitted_at}>{dateFormat.format(new Date(s.submitted_at))}</time>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {s.report ? formatMinutesShort(s.report.active_minutes) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {s.report ? formatPercent(s.report.paste_ratio) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
