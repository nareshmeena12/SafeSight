import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Library, Pencil, Users } from "lucide-react";
import { z } from "zod";
import { DeleteDepartment } from "@/components/admin/delete-department";
import { DepartmentDialog } from "@/components/admin/department-dialog";
import { DepartmentSelect } from "@/components/admin/department-select";
import { NoInstitution } from "@/components/admin/no-institution";
import { PolicyForm } from "@/components/admin/policy-form";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { RelianceBadge } from "@/components/product/reliance-badge";
import { StatCard } from "@/components/product/stat-card";
import { RelianceLineChart } from "@/components/teacher/charts";
import { Button } from "@/components/ui/button";
import { clearDepartmentPolicy } from "@/lib/admin/actions";
import { describePolicy } from "@/lib/admin/policy";
import {
  adminContext,
  departmentWeekly,
  listCourses,
  listDepartments,
  listPolicies,
  listStaff,
} from "@/lib/admin/queries";
import { percent, summariseDepartments } from "@/lib/admin/stats";
import { recentWeeks } from "@/lib/admin/weeks";
import { formatRelative } from "@/lib/teacher/dates";

export const metadata: Metadata = { title: "Department" };

const WEEKS = 8;

export default function DepartmentPage({ params, searchParams }: PageProps<"/admin/departments/[departmentId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Department params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Department({
  params,
  searchParams,
}: Pick<PageProps<"/admin/departments/[departmentId]">, "params" | "searchParams">) {
  const { db, institution } = await adminContext();
  if (!institution) return <NoInstitution />;
  const [{ departmentId }, query] = await Promise.all([params, searchParams]);
  // "Use the college default" adds ?reset=…, so the form starts again from it.
  const reset = typeof query.reset === "string" ? query.reset.slice(0, 20) : "form";
  if (!z.uuid().safeParse(departmentId).success) notFound();
  const [departments, policies, staff, courses, rows] = await Promise.all([
    listDepartments(db, institution.id),
    listPolicies(db, institution.id),
    listStaff(db),
    listCourses(db),
    departmentWeekly(db, WEEKS),
  ]);
  const department = departments.find((d) => d.id === departmentId);
  if (!department) notFound();

  const own = policies.departments.get(department.id) ?? null;
  const fallback = policies.college;
  const teachers = staff.filter((s) => s.departmentId === department.id);
  const deptCourses = courses.filter((c) => c.departmentId === department.id);
  const summary = summariseDepartments(rows, [department], recentWeeks(WEEKS))[0];
  const outside = deptCourses.reduce((n, c) => n + c.outsidePolicy, 0);
  const options = departments.map((d) => ({ id: d.id, name: d.name }));

  return (
    <>
      <Link
        href="/admin/departments"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        All departments
      </Link>
      <PageHeader
        eyebrow={department.code || "Department"}
        title={department.name}
        description={`${teachers.length} ${teachers.length === 1 ? "teacher" : "teachers"} · ${deptCourses.length} ${deptCourses.length === 1 ? "course" : "courses"}`}
        actions={
          <>
            <DepartmentDialog
              department={department}
              trigger={
                <Button variant="outline">
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
              }
            />
            <DeleteDepartment department={department} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Students active this week"
          value={summary.activeThisWeek}
          note={summary.students ? `of ${summary.students} (${percent(summary.activeShare)})` : "No students yet"}
        />
        <StatCard
          label="Average Reliance Score"
          value={summary.reliance === null ? "–" : <RelianceBadge score={summary.reliance} />}
          note={summary.reliance === null ? "Shown once 3 students have a score" : `${percent(summary.highShare)} in the high band`}
        />
        <StatCard
          label="Practice in the last 4 weeks"
          value={summary.signals.practice + summary.signals.explainBacks + summary.signals.mockTests}
          note={`${summary.signals.practice} practice sets, ${summary.signals.explainBacks} explain-backs, ${summary.signals.mockTests} mock tests`}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <section aria-labelledby="policy-title" className="min-w-0 rounded-lg border bg-surface p-6 lg:col-span-7">
          <h2 id="policy-title" className="text-title">
            AI policy
          </h2>
          <p className="mb-6 text-small text-muted-foreground">
            {own
              ? "New assignments in this department start from these settings."
              : fallback
                ? "This department follows the college default for now. Save to give it its own."
                : "Nothing is set yet, so teachers may choose anything. Save to set this department's policy."}
          </p>
          <PolicyForm key={reset} departmentId={department.id} policy={own ?? fallback} idPrefix="dept" />
          {own ? (
            <form action={clearDepartmentPolicy} className="mt-4 border-t pt-4">
              <input type="hidden" name="departmentId" value={department.id} />
              <Button type="submit" variant="ghost">
                {fallback ? "Use the college default instead" : "Remove this policy"}
              </Button>
            </form>
          ) : null}
          {outside > 0 ? (
            <p className="mt-4 rounded-md border bg-background p-3 text-small text-muted-foreground">
              {outside} existing {outside === 1 ? "assignment is" : "assignments are"} looser than this policy. They keep
              their settings; a teacher who changes them has to follow the policy.
            </p>
          ) : null}
        </section>

        <div className="grid min-w-0 content-start gap-6 lg:col-span-5">
          {summary.relianceTrend.some((p) => p.value !== null) ? (
            <section className="relative overflow-hidden rounded-lg border bg-surface p-6">
              <h2 className="mb-4 text-title">Reliance Score by week</h2>
              <RelianceLineChart data={summary.relianceTrend} height={160} title={`Average Reliance Score by week, ${department.name}`} />
            </section>
          ) : null}
          {fallback && own ? (
            <section className="rounded-lg border bg-surface p-6">
              <h2 className="text-title">College default</h2>
              <ul className="mt-2 grid gap-1 text-small text-muted-foreground">
                {describePolicy(fallback).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="teachers-title" className="mt-8">
        <h2 id="teachers-title" className="mb-4 text-title">
          Teachers
        </h2>
        {teachers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No teachers in this department yet"
            description="Move teachers here from the Teachers page, or invite new ones straight into it."
            action={
              <Button asChild variant="secondary">
                <Link href="/admin/teachers">Go to teachers</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-surface">
            {teachers.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="truncate text-label">{t.fullName || t.email}</p>
                  <p className="truncate text-small text-muted-foreground">
                    {t.email} · {t.courses} {t.courses === 1 ? "course" : "courses"} · last used AI tools: {formatRelative(t.lastActiveAt).toLowerCase()}
                  </p>
                </div>
                <DepartmentSelect
                  target="teacher"
                  id={t.id}
                  value={t.departmentId}
                  departments={options}
                  label={`Department for ${t.fullName || t.email}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="courses-title" className="mt-8">
        <h2 id="courses-title" className="mb-4 text-title">
          Courses
        </h2>
        {deptCourses.length === 0 ? (
          <EmptyState
            icon={Library}
            title="No courses in this department yet"
            description="A teacher's new courses join their department. You can also move a course on the Courses page."
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-surface">
            {deptCourses.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="truncate text-label">
                    {c.code ? <span className="mr-2 font-mono text-muted-foreground">{c.code}</span> : null}
                    {c.name}
                  </p>
                  <p className="text-small text-muted-foreground">
                    {c.teacherName} · {c.students} {c.students === 1 ? "student" : "students"} · {c.activeStudents7d} active this week
                  </p>
                </div>
                {c.avgReliance === null ? null : <RelianceBadge score={c.avgReliance} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
