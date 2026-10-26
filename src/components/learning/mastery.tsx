import { Badge } from "@/components/ui/badge";
import { masteryBand, masteryBandLabels } from "@/lib/learning/mastery";
import { cn } from "@/lib/utils";

const bandVariant = { needs_work: "critical", getting_there: "warning", strong: "good" } as const;
const barColour = { needs_work: "bg-critical", getting_there: "bg-warning", strong: "bg-good" } as const;

/** Mastery band: colour in the dot, meaning in the label, the number in mono. */
export function MasteryBadge({ mastery }: { mastery: number }) {
  const band = masteryBand(mastery);
  return (
    <Badge variant={bandVariant[band]} aria-label={`Mastery ${Math.round(mastery * 100)}%, ${masteryBandLabels[band].toLowerCase()}`}>
      <span className="font-mono">{Math.round(mastery * 100)}%</span>
      <span className="font-normal text-muted-foreground">{masteryBandLabels[band]}</span>
    </Badge>
  );
}

/** A thin bar for lists of topics. */
export function MasteryBar({ mastery, className }: { mastery: number; className?: string }) {
  const band = masteryBand(mastery);
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-border-strong/40", className)} aria-hidden="true">
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", barColour[band])}
        style={{ width: `${Math.max(4, Math.round(mastery * 100))}%` }}
      />
    </div>
  );
}
