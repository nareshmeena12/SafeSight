import { Badge } from "@/components/ui/badge";
import type { FlagSeverity, FlagType } from "@/lib/teacher/queries";

/** Plain-English names for flag types. Evidence for the teacher, never a verdict. */
export const flagTypeLabels: Record<FlagType, string> = {
  answer_seeking: "Repeated answer-seeking",
  exam_mode_attempt: "Used Sage in Exam mode",
  instruction_override: "Asked Sage to drop its rules",
  wellbeing: "Wellbeing check-in",
};

const severity = {
  high: { label: "High", variant: "critical" },
  medium: { label: "Medium", variant: "warning" },
  low: { label: "Low", variant: "good" },
} as const;

export function SeverityBadge({ value }: { value: FlagSeverity }) {
  const { label, variant } = severity[value];
  return (
    <Badge variant={variant} aria-label={`${label} priority`}>
      {label}
    </Badge>
  );
}
