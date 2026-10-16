import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Flag } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { EmptyState } from "@/components/product/empty-state";
import { CourseFilter } from "@/components/teacher/course-filter";
import { FlagList } from "@/components/teacher/flag-list";
import { flagTypeLabels } from "@/components/teacher/flag-meta";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { courseParam, enumParam } from "@/lib/teacher/params";
import { conversationsForFlags, courseScope, listFlags, type FlagType } from "@/lib/teacher/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Flags" };

const statuses = ["open", "resolved", "all"] as const;
const types = Object.keys(flagTypeLabels) as FlagType[];

export default function FlagsPage({ searchParams }: PageProps<"/teacher/flags">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FlagsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function FlagsContent({ searchParams }: Pick<PageProps<"/teacher/flags">, "searchParams">) {
  const user = await requireRole(["teacher", "admin"]);
  const params = await searchParams;
  const db = await createClient();
  const courses = (await courseScope(db, user.id)) ?? [];
  const requested = courseParam(params);
  const courseId = requested && courses.some((c) => c.id === requested) ? requested : null;
  const status = enumParam(params, "status", statuses) ?? "open";
  const type = enumParam(params, "type", types);

  const flags = (await listFlags(db, user.id, { courseId, status, type })) ?? [];
  const conversationFor = await conversationsForFlags(db, flags);

  function href(next: { status?: string; type?: string | null }) {
    const p = new URLSearchParams();
    if (courseId) p.set("course", courseId);
    const s = next.status ?? status;
    if (s !== "open") p.set("status", s);
    const t = next.type === undefined ? type : next.type;
    if (t) p.set("type", t);
    const q = p.toString();
    return q ? `/teacher/flags?${q}` : "/teacher/flags";
  }

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-full border px-4 text-small transition-colors duration-150 ease-out",
      active ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground hover:bg-hover hover:text-foreground",
    );

  return (
    <>
      <PageHeader
        eyebrow="Flags"
        title="Things to look at"
        description="Sage raises a flag when a pattern is worth your attention. Each one is evidence, not a verdict: you decide what it means."
        actions={<CourseFilter courses={courses} value={courseId} />}
      />
      <nav aria-label="Filter flags" className="mb-6 grid gap-3">
        <ul className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <li key={s}>
              <Link href={href({ status: s })} className={chip(status === s)} aria-current={status === s ? "true" : undefined}>
                {s === "open" ? "Open" : s === "resolved" ? "Resolved" : "All"}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link href={href({ type: null })} className={chip(!type)} aria-current={!type ? "true" : undefined}>
              Every type
            </Link>
          </li>
          {types.map((t) => (
            <li key={t}>
              <Link href={href({ type: t })} className={chip(type === t)} aria-current={type === t ? "true" : undefined}>
                {flagTypeLabels[t]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {flags.length === 0 ? (
        <EmptyState
          icon={Flag}
          title={status === "open" ? "Nothing to review" : "No flags here"}
          description={
            status === "open"
              ? "When Sage notices repeated answer-seeking, Exam-mode use or a student who may need support, it shows up here."
              : "Try another filter."
          }
        />
      ) : (
        <FlagList flags={flags} conversationFor={conversationFor} />
      )}
    </>
  );
}
