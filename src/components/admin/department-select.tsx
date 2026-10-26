"use client";

import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setCourseDepartment, setTeacherDepartment } from "@/lib/admin/actions";

const NONE = "none";

/**
 * Pick a department for a teacher or a course; saves straight away. A
 * teacher's courses without a department follow them into the new one.
 */
export function DepartmentSelect({
  target,
  id,
  value,
  departments,
  label,
}: {
  target: "teacher" | "course";
  id: string;
  value: string | null;
  departments: { id: string; name: string }[];
  /** Accessible name, e.g. "Department for Kavita Sharma". */
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  function change(next: string) {
    const form = new FormData();
    form.set(target === "teacher" ? "teacherId" : "courseId", id);
    form.set("departmentId", next === NONE ? "" : next);
    startTransition(async () => {
      await (target === "teacher" ? setTeacherDepartment(form) : setCourseDepartment(form));
    });
  }
  return (
    <Select value={value ?? NONE} onValueChange={change} disabled={pending}>
      <SelectTrigger aria-label={label} className="w-full min-w-40 sm:w-60" aria-busy={pending || undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No department</SelectItem>
        {departments.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
