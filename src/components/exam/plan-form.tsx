"use client";

import { CalendarRange } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PlanFormCourse = {
  id: string;
  label: string;
  /** The teacher's official exam date, if published and still ahead. */
  examDate: string | null;
  hasSyllabus: boolean;
  /** The student already has a plan for this course. */
  planned: boolean;
};

const minuteOptions = [30, 45, 60, 90, 120];

/** Pick a course, the exam date and daily time; the server builds the plan and the page opens it. */
export function PlanForm({ courses, minDate, maxDate }: { courses: PlanFormCourse[]; minDate: string; maxDate: string }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const course = courses.find((c) => c.id === courseId);
  const [examDate, setExamDate] = useState(course?.examDate ?? "");
  const [minutes, setMinutes] = useState("60");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickCourse(id: string) {
    setCourseId(id);
    const next = courses.find((c) => c.id === id);
    if (next?.examDate) setExamDate(next.examDate);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!courseId) return setError("Pick a course first.");
    if (!examDate) return setError("Pick your exam date.");
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/exam/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, examDate, minutesPerDay: Number(minutes) }),
      });
      const body = (await res.json().catch(() => null)) as { planId?: string; error?: string } | null;
      if (!res.ok || !body?.planId) throw new Error(body?.error ?? "We couldn't make your plan just now. Please try again.");
      router.push(`/student/exam/${body.planId}`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "We couldn't make your plan just now. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="plan-course">Course</Label>
          <Select value={courseId} onValueChange={pickCourse}>
            <SelectTrigger id="plan-course" className="w-full">
              <SelectValue placeholder="Pick a course" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="plan-date">Exam date</Label>
          <Input id="plan-date" type="date" min={minDate} max={maxDate} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="plan-minutes">Time each day</Label>
          <Select value={minutes} onValueChange={setMinutes}>
            <SelectTrigger id="plan-minutes" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {minuteOptions.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {course ? (
        <p className="text-small text-muted-foreground">
          {course.hasSyllabus ? "Your teacher published the syllabus, so the plan follows it." : "The plan uses topics from your course notes and your own practice."}
          {course.examDate ? " The date above is the one your teacher shared." : ""}
          {course.planned ? " You already have a plan for this course — this replaces it, keeping the days behind you." : ""}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-small text-muted-foreground">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} aria-busy={pending} className="justify-self-start">
        <CalendarRange aria-hidden="true" />
        {pending ? "Building your plan…" : "Make my plan"}
      </Button>
    </form>
  );
}
