import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** The result of a save, read out by screen readers. */
export function StatusNote({ status, className }: { status: { status: "success" | "error"; message: string } | null; className?: string }) {
  return (
    <p aria-live="polite" className={cn("min-h-5 text-small", className)}>
      {status ? (
        <span className={cn("inline-flex items-start gap-1.5", status.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {status.status === "error" ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={1.5} aria-hidden="true" />
          )}
          {status.message}
        </span>
      ) : null}
    </p>
  );
}
