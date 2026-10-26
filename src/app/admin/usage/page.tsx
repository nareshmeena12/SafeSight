import type { Metadata } from "next";
import { Suspense } from "react";
import { BarChart3 } from "lucide-react";
import { NoInstitution } from "@/components/admin/no-institution";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { StatCard } from "@/components/product/stat-card";
import { CountBarChart } from "@/components/teacher/charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminContext, aiUsage } from "@/lib/admin/queries";
import { compactNumber, percent, summariseUsage } from "@/lib/admin/stats";
import { recentWeeks } from "@/lib/admin/weeks";

export const metadata: Metadata = { title: "AI usage" };

const WEEKS = 8;
const roleLabel = { student: "Students", teacher: "Teachers and admins", other: "Other (tests and background jobs)" } as const;

export default function UsagePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Usage />
    </Suspense>
  );
}

async function Usage() {
  const { db, institution } = await adminContext();
  if (!institution) return <NoInstitution />;
  const weeks = recentWeeks(WEEKS);
  const usage = summariseUsage(await aiUsage(db, WEEKS), weeks);
  const change = usage.lastWeek.tokens ? usage.thisWeek.tokens / usage.lastWeek.tokens - 1 : null;

  return (
    <>
      <PageHeader
        eyebrow="AI usage"
        title="AI usage"
        description="Every call SafeSight makes to an AI model for your college, counted in tokens (pieces of text the model reads and writes). Student data is never used to train models."
      />
      {usage.total.calls === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No AI calls yet"
          description="Calls appear here once students ask Sage or teachers use Lens, briefs or feedback drafts."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Tokens this week"
              value={compactNumber(usage.thisWeek.tokens)}
              note={
                change === null
                  ? `${compactNumber(usage.thisWeek.calls)} calls`
                  : `${change >= 0 ? "Up" : "Down"} ${percent(Math.abs(change))} on last week`
              }
            />
            <StatCard label={`Tokens, last ${WEEKS} weeks`} value={compactNumber(usage.total.tokens)} note={`${compactNumber(usage.total.calls)} calls`} />
            <StatCard
              label="Calls that failed"
              value={percent(usage.total.calls ? usage.total.failed / usage.total.calls : 0)}
              note="Timeouts and errors; most were retried"
            />
          </div>

          <section className="relative mt-8 overflow-hidden rounded-lg border bg-surface p-6">
            <h2 className="text-title">Tokens by week</h2>
            <p className="mb-4 text-small text-muted-foreground">India-time weeks, Monday first.</p>
            <CountBarChart title="Tokens by week" data={usage.weeks.map((w) => ({ label: w.label, value: w.tokens }))} />
          </section>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <section aria-labelledby="features-title" className="min-w-0 lg:col-span-8">
              <h2 id="features-title" className="mb-4 text-title">
                By feature
              </h2>
              <div className="rounded-lg border bg-surface">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4 sm:pl-6">Feature</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead className="pr-4 sm:pr-6">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usage.byGroup.map((g) => (
                      <TableRow key={g.key}>
                        <TableCell className="pl-4 whitespace-normal sm:pl-6">
                          <p className="font-medium">{g.label}</p>
                          <p className="text-small text-muted-foreground">{g.note}</p>
                        </TableCell>
                        <TableCell className="font-mono">{compactNumber(g.calls)}</TableCell>
                        <TableCell className="font-mono">{compactNumber(g.tokens)}</TableCell>
                        <TableCell className="pr-4 font-mono sm:pr-6">{percent(g.share)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
            <section aria-labelledby="roles-title" className="min-w-0 lg:col-span-4">
              <h2 id="roles-title" className="mb-4 text-title">
                By who asked
              </h2>
              <ul className="divide-y rounded-lg border bg-surface">
                {usage.byRole.map((r) => (
                  <li key={r.role} className="flex items-center justify-between gap-4 p-4">
                    <span className="text-label">{roleLabel[r.role]}</span>
                    <span className="text-right font-mono text-small">
                      {compactNumber(r.tokens)} tokens
                      <span className="block text-muted-foreground">{compactNumber(r.calls)} calls</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}
