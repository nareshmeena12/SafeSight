import { cn } from "@/lib/utils";

/** A dashboard figure: label, a mono number and an optional note. */
export function StatCard({
  label,
  value,
  note,
  highlight = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  /** Insight amber marker — the one number to notice on a screen. */
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative rounded-lg border bg-surface p-6", className)}>
      {highlight ? (
        <span aria-hidden="true" className="absolute top-6 right-6 size-2 rounded-full bg-insight" />
      ) : null}
      <p className="text-label text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-mono-stat">{value}</p>
      {note ? <p className="mt-1 text-small text-muted-foreground">{note}</p> : null}
    </div>
  );
}
