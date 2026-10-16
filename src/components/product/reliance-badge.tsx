import { Badge } from "@/components/ui/badge";
import { relianceBand } from "@/lib/reliance";

const bands = {
  low: { label: "Low", variant: "good" },
  medium: { label: "Medium", variant: "warning" },
  high: { label: "High", variant: "critical" },
} as const;

/** Reliance Score with its band: colour in the dot, meaning in the label. */
export function RelianceBadge({ score }: { score: number }) {
  const { label, variant } = bands[relianceBand(score)];
  return (
    <Badge variant={variant} aria-label={`Reliance Score ${Math.round(score)}, ${label.toLowerCase()}`}>
      <span className="font-mono">{Math.round(score)}</span>
      <span className="font-normal text-muted-foreground">{label}</span>
    </Badge>
  );
}
