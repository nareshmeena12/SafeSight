import { Badge } from "@/components/ui/badge";
import type { CheckResult } from "@/lib/numbers/numbers";

const labels: Record<CheckResult, { text: string; variant: "good" | "warning" | "secondary" }> = {
  within: { text: "Matches", variant: "good" },
  outside: { text: "Doesn't match", variant: "warning" },
  unreadable: { text: "No number found", variant: "secondary" },
};

/** The auto-check result for a per-student-numbers answer (colour in a dot, always with a label). */
export function CheckBadge({ result }: { result: CheckResult | null }) {
  if (!result) return <Badge variant="secondary">No answer yet</Badge>;
  const l = labels[result];
  return <Badge variant={l.variant}>{l.text}</Badge>;
}
