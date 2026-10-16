import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDown, ArrowUp, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { RelianceBadge } from "@/components/product/reliance-badge";
import { CourseFilter } from "@/components/teacher/course-filter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/teacher/dates";
import { courseParam, enumParam } from "@/lib/teacher/params";
import { courseScope, getStudentRows, type StudentRow } from "@/lib/teacher/queries";

export const metadata: Metadata = { title: "Students" };

const sortKeys = ["name", "conversations", "reliance", "flags", "active"] as const;
type SortKey = (typeof sortKeys)[number];
type Dir = "asc" | "desc";

const defaultDir: Record<SortKey, Dir> = {
  name: "asc",
  conversations: "desc",
  reliance: "desc",
  flags: "desc",
  active: "desc",
};

function sortRows(rows: StudentRow[], key: SortKey, dir: Dir): StudentRow[] {
  const value = (r: StudentRow): number | string => {
    switch (key) {
      case "name":
        return r.name.toLowerCase();
      case "conversations":
        return r.conversations;
      case "reliance":
        return r.reliance ?? -1;
      case "flags":
        return r.openFlags;
      case "active":
        return r.lastActiveAt ?? "";
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va < vb) return -sign;
    if (va > vb) return sign;
    return a.name.localeCompare(b.name);
  });
}

type SortState = { sort: SortKey; dir: Dir; courseId: string | null };

function sortHref({ sort, dir, courseId }: SortState, key: SortKey) {
  const next = new URLSearchParams();
  if (courseId) next.set("course", courseId);
  next.set("sort", key);
  next.set("dir", key === sort ? (dir === "asc" ? "desc" : "asc") : defaultDir[key]);
  return `/teacher/students?${next.toString()}`;
}

function SortHead({
  k,
  children,
  className,
  ...state
}: SortState & { k: SortKey; children: React.ReactNode; className?: string }) {
  const active = state.sort === k;
  const Icon = state.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (state.dir === "asc" ? "ascending" : "descending") : "none"} className={className}>
      <Link href={sortHref(state, k)} scroll={false} className="inline-flex min-h-11 items-center gap-1 hover:text-foreground">
        {children}
        {active ? <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" /> : null}
      </Link>
    </TableHead>
  );
}

export default function StudentsPage({ searchParams }: PageProps<"/teacher/students">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function StudentsContent({ searchParams }: Pick<PageProps<"/teacher/students">, "searchParams">) {
  const user = await requireRole(["teacher", "admin"]);
  const params = await searchParams;
  const db = await createClient();
  const courses = (await courseScope(db, user.id)) ?? [];
  const requested = courseParam(params);
  const courseId = requested && courses.some((c) => c.id === requested) ? requested : null;
  const sort = enumParam(params, "sort", sortKeys) ?? "name";
  const dir = enumParam(params, "dir", ["asc", "desc"] as const) ?? defaultDir[sort];

  const sortState: SortState = { sort, dir, courseId };
  const rows = sortRows((await getStudentRows(db, user.id, { courseId })) ?? [], sort, dir);

  return (
    <>
      <PageHeader
        eyebrow="Students"
        title="Your students"
        description="Sage use over the last 30 days and each student's latest weekly Reliance Score."
        actions={<CourseFilter courses={courses} value={courseId} />}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Students appear here when they join one of your courses with its join code."
        />
      ) : (
        <div className="rounded-lg border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead {...sortState} k="name" className="pl-6">
                  Name
                </SortHead>
                <TableHead className="hidden md:table-cell">Course</TableHead>
                <SortHead {...sortState} k="conversations">Conversations</SortHead>
                <SortHead {...sortState} k="reliance">Reliance Score</SortHead>
                <SortHead {...sortState} k="flags">Open flags</SortHead>
                <SortHead {...sortState} k="active" className="hidden pr-6 sm:table-cell">
                  Last active
                </SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-6">
                    <Link
                      href={`/teacher/students/${r.id}`}
                      className="inline-flex min-h-11 items-center font-medium hover:text-primary"
                    >
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {r.courses.map((c) => c.code || c.name).join(", ")}
                  </TableCell>
                  <TableCell className="font-mono">{r.conversations}</TableCell>
                  <TableCell>
                    {r.reliance === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <RelianceBadge score={r.reliance} />
                    )}
                  </TableCell>
                  <TableCell className="font-mono">
                    {r.openFlags > 0 ? r.openFlags : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="hidden pr-6 text-muted-foreground sm:table-cell">
                    {formatRelative(r.lastActiveAt)}
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
