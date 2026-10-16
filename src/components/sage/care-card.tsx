import { HeartHandshake, Phone } from "lucide-react";
import type { CareData } from "@/lib/sage/types";

/** Support contacts shown with Sage's reply when a student may be struggling. */
export function CareCard({ care }: { care: CareData }) {
  return (
    <div className="mb-3 rounded-md border bg-primary-soft/60 p-4">
      <p className="flex items-center gap-2 text-label">
        <HeartHandshake className="size-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
        You don&apos;t have to handle this alone
      </p>
      <ul className="mt-2 space-y-1.5 text-small">
        <li>Talk to {care.counselling}.</li>
        <li>
          Call{" "}
          <a href={`tel:${care.helplineNumber}`} className="inline-flex items-center gap-1 font-mono text-primary underline underline-offset-4">
            <Phone className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            {care.helplineNumber}
          </a>{" "}
          — {care.helpline}.
        </li>
        <li>
          If you might be in danger right now, call <a href="tel:112" className="font-mono text-primary underline underline-offset-4">112</a> or tell someone near you.
        </li>
      </ul>
    </div>
  );
}
