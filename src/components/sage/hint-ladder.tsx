import { hintSteps } from "@/lib/sage/ladder";
import { cn } from "@/lib/utils";

/** The small "hint level" indicator in the Sage header (PLAN.md §6). */
export function HintLadder({ level }: { level: number | null }) {
  const step = level ? hintSteps[level - 1] : null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ol className="flex shrink-0 gap-1" aria-hidden="true">
        {hintSteps.map((s) => (
          <li
            key={s.level}
            className={cn(
              "h-1.5 w-5 rounded-full transition-colors duration-300 ease-out sm:w-6",
              level && s.level <= level ? "bg-primary" : "bg-border-strong/60",
            )}
          />
        ))}
      </ol>
      <p className="min-w-0 truncate text-small text-muted-foreground" aria-live="polite">
        {step ? (
          <>
            <span className="text-foreground">Hint level {step.level} of 5</span> · {step.name}
          </>
        ) : (
          "Hint level: not started"
        )}
      </p>
    </div>
  );
}
