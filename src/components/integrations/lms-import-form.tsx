"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";
import { ErrorNote } from "./notes";
import { Button } from "@/components/ui/button";
import type { LmsImportState } from "@/lib/integrations/actions";
import { ImportResult } from "./import-result";
import { TargetFields, type CourseOption } from "./target-fields";

const initial: LmsImportState = { status: "idle" };

/** Import one Classroom / Moodle class the server has already read (S25). */
export function LmsImportForm({
  action,
  externalId,
  courses,
  defaultTarget,
  defaultName,
  defaultCode,
  studentCount,
  emailReady,
}: {
  action: (prev: LmsImportState, formData: FormData) => Promise<LmsImportState>;
  externalId: string;
  courses: CourseOption[];
  defaultTarget?: string;
  defaultName: string;
  defaultCode?: string;
  studentCount: number;
  emailReady: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="externalId" value={externalId} />
      {/* After an import, point at the course it went into, so a second click doesn't make another course. */}
      <TargetFields
        key={state.courseId ?? "first"}
        idPrefix={`lms-${externalId}`}
        courses={courses}
        defaultTarget={state.courseId ?? defaultTarget}
        defaultName={defaultName}
        defaultCode={defaultCode}
        disabled={pending}
      />
      <ErrorNote message={state.status === "error" ? state.message : undefined} />
      {state.status === "success" && state.summary && state.courseId ? (
        <ImportResult summary={state.summary} courseId={state.courseId} created={state.created} />
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending || studentCount === 0}>
          <Download aria-hidden="true" />
          {pending ? "Importing…" : `Import ${studentCount} ${studentCount === 1 ? "student" : "students"}`}
        </Button>
        <p className="text-small text-muted-foreground">
          {emailReady
            ? "Students who already use SafeSight join at once; everyone else gets an invite email."
            : "Students who already use SafeSight join at once; everyone else joins when they sign in with that email."}
        </p>
      </div>
    </form>
  );
}
