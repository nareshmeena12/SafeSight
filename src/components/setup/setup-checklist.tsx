import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { setupDone, type SetupStep } from "@/lib/setup/checklist";
import { cn } from "@/lib/utils";

/**
 * "Set up this course in 10 minutes": syllabus → notes → first assignment →
 * invite students. Shown on the course page until every step is done.
 */
export function SetupChecklist({ steps, compact = false }: { steps: SetupStep[]; compact?: boolean }) {
  const done = setupDone(steps);
  const next = steps.find((s) => !s.done);
  return (
    <section aria-labelledby="setup-title" className="rounded-lg border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-title" className="text-title">
          Set up this course
        </h2>
        <p className="font-mono text-small text-muted-foreground">
          {done} of {steps.length} done
        </p>
      </div>
      <p className="mt-1 text-small text-muted-foreground">About ten minutes. Each step helps Sage guide your class better.</p>
      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-hover"
        role="progressbar"
        aria-label="Course setup"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-1">
        {steps.map((step, i) => {
          const isNext = step === next;
          return (
            <li key={step.key}>
              <Link
                href={step.href}
                className={cn(
                  "group flex min-h-11 items-start gap-3 rounded-md px-2 py-3 transition-colors duration-150 ease-out hover:bg-hover",
                  isNext && "bg-primary-soft hover:bg-primary-soft",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border font-mono text-small",
                    step.done ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {step.done ? <Check className="size-3.5" strokeWidth={2} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-label", step.done && "text-muted-foreground")}>
                    {step.title}
                    <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                  </span>
                  <span className="block text-small text-muted-foreground">{step.description}</span>
                </span>
                <span className={cn("mt-0.5 shrink-0 items-center gap-1 text-small text-primary", compact ? "flex" : "hidden sm:flex")}>
                  {step.done || compact ? null : step.action}
                  <ArrowRight
                    className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
