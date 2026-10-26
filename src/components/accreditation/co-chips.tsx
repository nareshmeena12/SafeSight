"use client";

import { cn } from "@/lib/utils";

/** Toggle buttons for picking course outcomes (CO1, CO2 …). */
export function CoChips({
  outcomes,
  selected,
  onChange,
  label,
  disabled,
}: {
  outcomes: { id: string; code: string; description: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
  disabled?: boolean;
}) {
  if (!outcomes.length) return <p className="text-small text-muted-foreground">Add course outcomes first.</p>;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {outcomes.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            title={o.description}
            disabled={disabled}
            onClick={() => onChange(on ? selected.filter((id) => id !== o.id) : [...selected, o.id])}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-2.5 font-mono text-small transition-colors duration-150 ease-out disabled:opacity-60",
              on ? "border-primary bg-primary-soft text-primary" : "bg-surface text-muted-foreground hover:bg-hover hover:text-foreground",
            )}
          >
            {o.code}
          </button>
        );
      })}
    </div>
  );
}
