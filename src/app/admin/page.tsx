import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { DepartmentDialog } from "@/components/admin/department-dialog";
import { NoInstitution } from "@/components/admin/no-institution";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { RelianceBadge } from "@/components/product/reliance-badge";
import { StatCard } from "@/components/product/stat-card";
import { CountBarChart, RelianceLineChart } from "@/components/teacher/charts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminContext, adoption, aiUsage, departmentWeekly, listDepartments, listStaff } from "@/lib/admin/queries";
import { compactNumber, percent, summariseDepartments, summariseUsage } from "@/lib/admin/stats";
import { formatWeekLabel, recentWeeks } from "@/lib/admin/weeks";

export const metadata: Metadata = { title: "Institution" };

const WEEKS = 8;

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const { db, institution } = await adminContext();
  if (!institution) return <NoInstitution />;
  const weeks = recentWeeks(WEEKS);
  const [departments, staff, adoptionRows, deptRows, usageRows] = await Promise.all([
    listDepartments(db, institution.id),
    listStaff(db),
    adoption(db, WEEKS),
    departmentWeekly(db, WEEKS),
    aiUsage(db, WEEKS),
  ]);
  const summaries = summariseDepartments(deptRows, departments, weeks);
  const usage = summariseUsage(usageRows, weeks);
  const thisWeek = adoptionRows.at(-1);
  const enrolled = thisWeek?.enrolledStudents ?? 0;
  const teachers = staff.filter((s) => s.role === "teacher").length;
  const withScores = summaries.filter((d) => d.relianceTrend.some((p) => p.value !== null));

  return (
    <>
      <PageHeader
        eyebrow={institution.city ? `Institution · ${institution.city}` : "Institution"}
        title={institution.name}
        description="How your college uses SafeSight, by week and by department. These are totals and averages over groups of students; nobody's chats or individual scores are shown here."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/policy">AI policy</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Students active this week"
          value={thisWeek?.activeStudents ?? 0}
          note={enrolled ? `of ${enrolled} enrolled (${percent((thisWeek?.activeStudents ?? 0) / enrolled)})` : "No students enrolled yet"}
          highlight
        />
        <StatCard
          label="Teachers active this week"
          value={thisWeek?.activeTeachers ?? 0}
          note={teachers ? `of ${teachers} ${teachers === 1 ? "teacher" : "teachers"}` : "No teachers yet"}
        />
        <StatCard label="Questions to Sage this week" value={thisWeek?.sageMessages ?? 0} note="Messages from students" />
        <StatCard
          label="AI calls this week"
          value={compactNumber(usage.thisWeek.calls)}
          note={`${compactNumber(usage.thisWeek.tokens)} tokens`}
        />
      </div>

      <section aria-labelledby="adoption-title" className="mt-8 grid gap-4 lg:grid-cols-2">
        <h2 id="adoption-title" className="sr-only">
          Adoption
        </h2>
        <div className="relative min-w-0 overflow-hidden rounded-lg border bg-surface p-6">
          <h3 className="text-title">Weekly active students</h3>
          <p className="mb-4 text-small text-muted-foreground">
            Asked Sage, wrote in Trace, practised or took a mock test that week.
          </p>
          <CountBarChart
            title="Weekly active students"
            data={adoptionRows.map((r) => ({ label: formatWeekLabel(r.week), value: r.activeStudents }))}
          />
        </div>
        <div className="relative min-w-0 overflow-hidden rounded-lg border bg-surface p-6">
          <h3 className="text-title">Weekly active teachers</h3>
          <p className="mb-4 text-small text-muted-foreground">
            Set work, used Lens or a brief, answered a doubt, resolved a flag or ran a lab.
          </p>
          <CountBarChart
            title="Weekly active teachers"
            data={adoptionRows.map((r) => ({ label: formatWeekLabel(r.week), value: r.activeTeachers }))}
          />
        </div>
      </section>

      <section aria-labelledby="departments-title" className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="departments-title" className="text-title">
              By department
            </h2>
            <p className="text-small text-muted-foreground">
              Learning signals are the last 4 weeks. Averages appear once at least 3 students have a score.
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/admin/departments">
              Departments
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        {summaries.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No departments yet"
            description="Add your departments to set an AI policy for each and see how they compare."
            action={
              <DepartmentDialog
                trigger={
                  <Button>
                    <Plus aria-hidden="true" />
                    New department
                  </Button>
                }
              />
            }
          />
        ) : (
          <div className="rounded-lg border bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4 sm:pl-6">Department</TableHead>
                  <TableHead className="hidden sm:table-cell">Active</TableHead>
                  <TableHead>Reliance</TableHead>
                  <TableHead className="hidden md:table-cell">In high band</TableHead>
                  <TableHead className="hidden lg:table-cell">Practice sets</TableHead>
                  <TableHead className="hidden lg:table-cell">Explain-backs</TableHead>
                  <TableHead className="hidden lg:table-cell">Mock tests</TableHead>
                  <TableHead className="hidden md:table-cell">Doubts</TableHead>
                  <TableHead className="hidden pr-6 sm:table-cell">Mastery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((d) => (
                  <TableRow key={d.id ?? "none"}>
                    <TableCell className="pl-4 whitespace-normal sm:pl-6">
                      {d.id ? (
                        <Link href={`/admin/departments/${d.id}`} className="inline-flex min-h-11 items-center font-medium hover:text-primary">
                          {d.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{d.name}</span>
                      )}
                      <span className="block text-small text-muted-foreground">
                        {d.students} {d.students === 1 ? "student" : "students"}
                        <span className="sm:hidden">{d.students ? ` · ${percent(d.activeShare)} active` : ""}</span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden font-mono sm:table-cell">{d.students ? percent(d.activeShare) : "–"}</TableCell>
                    <TableCell>
                      {d.reliance === null ? <span className="text-muted-foreground">–</span> : <RelianceBadge score={d.reliance} />}
                    </TableCell>
                    <TableCell className="hidden font-mono md:table-cell">{percent(d.highShare)}</TableCell>
                    <TableCell className="hidden font-mono lg:table-cell">{d.signals.practice}</TableCell>
                    <TableCell className="hidden font-mono lg:table-cell">{d.signals.explainBacks}</TableCell>
                    <TableCell className="hidden font-mono lg:table-cell">{d.signals.mockTests}</TableCell>
                    <TableCell className="hidden font-mono md:table-cell">{d.signals.doubts}</TableCell>
                    <TableCell className="hidden pr-6 font-mono sm:table-cell">{percent(d.mastery)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {withScores.length > 0 ? (
        <section aria-labelledby="reliance-title" className="mt-8">
          <h2 id="reliance-title" className="text-title">
            Reliance Score by department
          </h2>
          <p className="mb-4 text-small text-muted-foreground">
            The weekly average (0–100; lower means students do more of the thinking). Dashed lines mark the medium and high bands.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {withScores.map((d) => (
              <div key={d.id ?? "none"} className="relative min-w-0 overflow-hidden rounded-lg border bg-surface p-6">
                <h3 className="mb-4 text-label">{d.name}</h3>
                <RelianceLineChart data={d.relianceTrend} title={`Average Reliance Score by week, ${d.name}`} height={160} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 flex flex-col gap-4 rounded-lg border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-title">AI usage</h2>
          <p className="text-small text-muted-foreground">
            {compactNumber(usage.total.tokens)} tokens over {WEEKS} weeks, {compactNumber(usage.thisWeek.tokens)} this week.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/usage">
            See AI usage
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
    </>
  );
}
