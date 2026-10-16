import { FileSearch } from "lucide-react";
import { StatCard } from "@/components/product/stat-card";
import { formatMinutesShort, formatPercent } from "@/lib/trace/summary";

export type EvidenceReport = {
  paste_ratio: number;
  active_minutes: number;
  sessions: number;
  summary: string;
};

/** Trace's neutral evidence summary with its three numbers. */
export function EvidenceSummary({
  report,
  pending,
}: {
  report: EvidenceReport | null;
  /** Shown instead of the summary while there is no report yet. */
  pending?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="evidence-heading" className="grid gap-4">
      <div className="rounded-lg border bg-surface p-6">
        <h2 id="evidence-heading" className="flex items-center gap-2 text-label text-muted-foreground">
          <FileSearch className="size-4" strokeWidth={1.5} aria-hidden="true" />
          How this was written
        </h2>
        {report ? (
          <p className="mt-2 text-lead text-pretty">{report.summary}</p>
        ) : (
          <div className="mt-2 text-muted-foreground">{pending}</div>
        )}
        <p className="mt-3 text-small text-muted-foreground">
          Trace reports evidence from the editor, not conclusions. Talk with the student before
          deciding what it means.
        </p>
      </div>
      {report ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Active writing time" value={formatMinutesShort(report.active_minutes)} />
          <StatCard label="Sessions" value={report.sessions} />
          <StatCard label="Pasted share of final text" value={formatPercent(report.paste_ratio)} />
        </div>
      ) : null}
    </section>
  );
}
