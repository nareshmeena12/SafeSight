import { CircleOff, MessagesSquare, Sprout } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type AiMode = "learn" | "assist" | "exam";

const modes = {
  learn: { label: "Learn", hint: "Hints only", icon: Sprout, variant: "default" },
  assist: { label: "Assist", hint: "Explanations allowed", icon: MessagesSquare, variant: "outline" },
  exam: { label: "Exam", hint: "AI off", icon: CircleOff, variant: "secondary" },
} as const;

/** The AI rule of an assignment (PLAN.md §3). */
export function ModeBadge({ mode, withHint = false }: { mode: AiMode; withHint?: boolean }) {
  const { label, hint, icon: Icon, variant } = modes[mode];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
      {withHint ? <span className="font-normal opacity-80">· {hint}</span> : null}
    </Badge>
  );
}
