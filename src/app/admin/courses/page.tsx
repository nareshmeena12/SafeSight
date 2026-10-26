import type { Metadata } from "next";
import { Suspense } from "react";
import { Library } from "lucide-react";
import { DepartmentSelect } from "@/components/admin/department-select";
import { NoInstitution } from "@/components/admin/no-institution";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { RelianceBadge } from "@/components/product/reliance-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminContext, listCourses, listDepartments } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Courses" };

export default function AdminCoursesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Courses />
    </Suspense>
  );
}

async function Courses() {
  const { db, institution } = await adminContext();
  if (!institution) return <NoInstitution />;
  const [courses, departments] = await Promise.all([listCourses(db), listDepartments(db, institution.id)]);
  const options = departments.map((d) => ({ id: d.id, name: d.name }));
  const outside = courses.reduce((n, c) => n + c.outsidePolicy, 0);

  return (
    <>
      <PageHeader
        eyebrow="Courses"
        title="Courses"
        description="Every course at your college, with its department (whose AI policy it follows). Scores are class averages, shown once 3 students have one."
      />
      {courses.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No courses yet"
          description="Courses appear here as soon as your teachers create them."
        />
      ) : (
        <>
          {outside > 0 ? (
            <p className="mb-4 text-small text-muted-foreground">
              {outside} {outside === 1 ? "assignment was" : "assignments were"} set up before the current policy and{" "}
              {outside === 1 ? "is" : "are"} looser than it. {outside === 1 ? "It keeps" : "They keep"} {outside === 1 ? "its" : "their"}{" "}
              settings until a teacher edits {outside === 1 ? "it" : "them"}.
            </p>
          ) : null}
          <div className="rounded-lg border bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4 sm:pl-6">Course</TableHead>
                  <TableHead className="hidden md:table-cell">Students</TableHead>
                  <TableHead className="hidden md:table-cell">Active, 7 days</TableHead>
                  <TableHead className="hidden lg:table-cell">Reliance</TableHead>
                  <TableHead className="hidden lg:table-cell">Open flags</TableHead>
                  <TableHead className="pr-4 sm:pr-6">Department</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4 whitespace-normal sm:pl-6">
                      <p className="font-medium">
                        {c.code ? <span className="mr-2 font-mono text-muted-foreground">{c.code}</span> : null}
                        {c.name}
                      </p>
                      <p className="text-small text-muted-foreground">
                        {c.teacherName} · {c.assignments} {c.assignments === 1 ? "assignment" : "assignments"}
                        <span className="md:hidden">
                          {" "}
                          · {c.students} {c.students === 1 ? "student" : "students"}
                        </span>
                        {c.outsidePolicy > 0 ? ` · ${c.outsidePolicy} looser than policy` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden font-mono md:table-cell">{c.students}</TableCell>
                    <TableCell className="hidden font-mono md:table-cell">{c.activeStudents7d}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {c.avgReliance === null ? <span className="text-muted-foreground">–</span> : <RelianceBadge score={c.avgReliance} />}
                    </TableCell>
                    <TableCell className="hidden font-mono lg:table-cell">{c.openFlags}</TableCell>
                    <TableCell className="pr-4 sm:pr-6">
                      <DepartmentSelect
                        target="course"
                        id={c.id}
                        value={c.departmentId}
                        departments={options}
                        label={`Department for ${c.name}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
