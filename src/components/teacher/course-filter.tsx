"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

/** Course picker that keeps the choice in the URL (?course=…). */
export function CourseFilter({
  courses,
  value,
}: {
  courses: { id: string; name: string; code: string }[];
  value: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (courses.length < 2) return null;

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === ALL) params.delete("course");
    else params.set("course", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="course-filter" className="sr-only">
        Course
      </Label>
      <Select value={value ?? ALL} onValueChange={onChange}>
        <SelectTrigger id="course-filter" className="w-full min-w-56 sm:w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All courses</SelectItem>
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.code ? `${c.code} · ${c.name}` : c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
