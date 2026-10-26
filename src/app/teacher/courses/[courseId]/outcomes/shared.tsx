import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { OutcomeTabs } from "@/components/accreditation/outcome-tabs";

/** Back link, title and tabs shared by the course's accreditation pages. */
export function OutcomesHeader({
  course,
  active,
  actions,
}: {
  course: { id: string; name: string; code: string };
  active: "outcomes" | "assessments" | "report";
  actions?: React.ReactNode;
}) {
  return (
    <>
      <Link
        href={`/teacher/courses/${course.id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        {course.name}
      </Link>
      <PageHeader
        eyebrow={course.code || "Accreditation"}
        title="Outcomes and attainment"
        description="Course outcomes, their mapping to programme outcomes, and how far students reached them, for NBA / NAAC reports."
        actions={actions}
        className="lg:mb-8"
      />
      <OutcomeTabs courseId={course.id} active={active} />
    </>
  );
}
