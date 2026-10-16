import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A designed empty state: icon, one plain sentence, optional next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed bg-surface/60 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h2 className="text-title">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-md text-small text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
