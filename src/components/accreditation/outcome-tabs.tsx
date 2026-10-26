import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "outcomes", label: "Outcomes and mapping", path: "" },
  { key: "assessments", label: "Assessments", path: "/assessments" },
  { key: "report", label: "Attainment report", path: "/report" },
] as const;

/** Navigation between a course's three accreditation pages. */
export function OutcomeTabs({ courseId, active }: { courseId: string; active: (typeof tabs)[number]["key"] }) {
  return (
    <nav aria-label="Accreditation" className="-mx-4 mb-8 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={`/teacher/courses/${courseId}/outcomes${t.path}`}
              aria-current={t.key === active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-small transition-colors duration-150 ease-out",
                t.key === active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
