import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, ChevronRight, Plus } from "lucide-react";
import { DepartmentDialog } from "@/components/admin/department-dialog";
import { NoInstitution } from "@/components/admin/no-institution";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listModes } from "@/lib/admin/policy";
import { adminContext, effectivePolicy, listCourses, listDepartments, listPolicies, listStaff } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Departments" };

export default function DepartmentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Departments />
    </Suspense>
  );
}

async function Departments() {
  const { db, institution } = await adminContext();
  if (!institution) return <NoInstitution />;
  const [departments, policies, staff, courses] = await Promise.all([
    listDepartments(db, institution.id),
    listPolicies(db, institution.id),
    listStaff(db),
    listCourses(db),
  ]);
  const unassignedTeachers = staff.filter((s) => s.role === "teacher" && !s.departmentId).length;
  const unassignedCourses = courses.filter((c) => !c.departmentId).length;

  const newDepartment = (
    <DepartmentDialog
      trigger={
        <Button>
          <Plus aria-hidden="true" />
          New department
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        eyebrow="Departments"
        title="Departments"
        description="Each department can have its own AI policy. Teachers and their new courses follow their department's."
        actions={departments.length ? newDepartment : undefined}
      />
      {departments.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No departments yet"
          description="Add Mechanical, Civil, Computer Science and so on. Then put teachers in them and set each one's AI policy."
          action={newDepartment}
        />
      ) : (
        <ul className="grid gap-3">
          {departments.map((d) => {
            const { policy, source } = effectivePolicy(policies, d.id);
            const teacherCount = staff.filter((s) => s.departmentId === d.id).length;
            const courseCount = courses.filter((c) => c.departmentId === d.id).length;
            return (
              <li key={d.id}>
                <Link
                  href={`/admin/departments/${d.id}`}
                  className="flex items-center gap-4 rounded-lg border bg-surface p-4 transition-colors duration-150 hover:bg-hover sm:p-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-title">
                      {d.name}
                      {d.code ? <span className="font-mono text-small text-muted-foreground">{d.code}</span> : null}
                    </p>
                    <p className="mt-1 text-small text-muted-foreground">
                      {teacherCount} {teacherCount === 1 ? "teacher" : "teachers"} · {courseCount}{" "}
                      {courseCount === 1 ? "course" : "courses"}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-2">
                      {policy ? (
                        <>
                          <Badge variant="outline">{listModes(policy.allowedModes)}</Badge>
                          <Badge variant="outline">Hints up to step {policy.maxHintLevel}</Badge>
                          <Badge variant="outline">{policy.labModeAllowed ? "Lab Mode on" : "Lab Mode off"}</Badge>
                          {source === "college" ? <Badge variant="secondary">College default</Badge> : null}
                        </>
                      ) : (
                        <Badge variant="secondary">No policy yet</Badge>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {departments.length > 0 && (unassignedTeachers > 0 || unassignedCourses > 0) ? (
        <p className="mt-6 text-small text-muted-foreground">
          {unassignedTeachers > 0 ? (
            <>
              <Link href="/admin/teachers" className="underline underline-offset-4 hover:text-foreground">
                {unassignedTeachers} {unassignedTeachers === 1 ? "teacher has" : "teachers have"} no department
              </Link>
              {unassignedCourses > 0 ? " and " : "."}
            </>
          ) : null}
          {unassignedCourses > 0 ? (
            <>
              <Link href="/admin/courses" className="underline underline-offset-4 hover:text-foreground">
                {unassignedCourses} {unassignedCourses === 1 ? "course has" : "courses have"} none
              </Link>
              . They follow the college default policy.
            </>
          ) : null}
        </p>
      ) : null}
    </>
  );
}
