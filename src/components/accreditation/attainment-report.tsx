import { Badge } from "@/components/ui/badge";
import {
  formatNumber,
  formatPct,
  formatValue,
  type AttainmentSettings,
  type CoResult,
  type PoResult,
} from "@/lib/accreditation/attainment";
import { DRAFT_NOTE, KIND_LABEL } from "@/lib/accreditation/report";

function LevelBadge({ level, met }: { level: number | null; met: boolean | null }) {
  if (level === null) return <Badge variant="secondary">Not assessed</Badge>;
  return <Badge variant={met ? "good" : "warning"}>Level {level}</Badge>;
}

/** A thin bar for a % with a tick at the target. */
function Meter({ pct, target, label }: { pct: number | null; target: number; label: string }) {
  return (
    <div className="relative h-2 w-full rounded-full bg-hover" role="img" aria-label={label}>
      {pct !== null ? <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /> : null}
      <div className="absolute -top-1 h-4 w-px bg-foreground/60" style={{ left: `${Math.min(100, target)}%` }} aria-hidden="true" />
    </div>
  );
}

export function DraftNotice() {
  return (
    <p className="rounded-md border border-dashed px-4 py-3 text-small text-muted-foreground">
      <span className="font-medium text-foreground">{DRAFT_NOTE}.</span> The exports carry this note on every page. Check every figure and the layout your
      university or NBA / NAAC expects before you submit.
    </p>
  );
}

/** CO attainment with every assessment behind it and the sum that produced it. */
/** The share of students the target level needs (the tick on each bar). */
export function targetThreshold(s: AttainmentSettings) {
  return s.targetLevel >= 3 ? s.level3Pct : s.targetLevel >= 2 ? s.level2Pct : s.level1Pct;
}

export function CoAttainmentList({ results, settings }: { results: CoResult[]; settings: AttainmentSettings }) {
  return (
    <ul className="grid gap-3">
      {results.map((c) => (
        <li key={c.outcome.id} className="rounded-lg border bg-surface">
          <details className="group">
            <summary className="grid cursor-pointer list-none gap-3 p-5 sm:grid-cols-[5rem_1fr_9rem] sm:items-center [&::-webkit-details-marker]:hidden">
              <span className="font-mono text-label text-primary">{c.outcome.code}</span>
              <span className="grid min-w-0 gap-2">
                <span className="line-clamp-2 text-small">{c.outcome.description}</span>
                <Meter
                  pct={c.pct}
                  target={targetThreshold(settings)}
                  label={`${c.outcome.code}: ${formatPct(c.pct)} of students reached the target`}
                />
              </span>
              <span className="flex items-center gap-2 sm:justify-end">
                <span className="font-mono text-small">{formatPct(c.pct)}</span>
                <LevelBadge level={c.level} met={c.met} />
              </span>
            </summary>
            <div className="grid gap-3 border-t p-5">
              <p className="text-small">
                <span className="font-medium">How it was computed: </span>
                {c.formula}
              </p>
              {c.rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-small">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th scope="col" className="py-2 pr-3 font-medium">Assessment</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Questions</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">Assessed</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">Reached {formatNumber(settings.targetPct)}%</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">Share</th>
                        <th scope="col" className="py-2 text-right font-medium">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.rows.map((r) => (
                        <tr key={r.assessmentId} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-3">
                            {r.title}
                            <span className="block text-muted-foreground">{KIND_LABEL[r.kind]}</span>
                            {r.note ? <span className="block text-muted-foreground">{r.note}</span> : null}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{r.detail}</td>
                          <td className="py-2 pr-3 text-right font-mono">{r.assessed === null ? "< 3" : r.assessed}</td>
                          <td className="py-2 pr-3 text-right font-mono">{r.attained ?? "—"}</td>
                          <td className="py-2 pr-3 text-right font-mono">{formatPct(r.pct)}</td>
                          <td className="py-2 text-right font-mono">{r.counted ? formatNumber(r.weight) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

export function PoAttainmentTable({ results }: { results: PoResult[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-surface">
      <table className="w-full min-w-[36rem] text-small">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-medium">PO</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Attainment (0–3)</th>
            <th scope="col" className="px-4 py-3 font-medium">How it was computed</th>
          </tr>
        </thead>
        <tbody>
          {results.map((p) => (
            <tr key={p.outcome.id} className="border-b last:border-0 align-top">
              <th scope="row" className="px-4 py-3 text-left font-normal">
                <span className="font-mono text-primary">{p.outcome.code}</span>
                {p.outcome.title ? <span className="block text-muted-foreground">{p.outcome.title}</span> : null}
              </th>
              <td className="px-4 py-3 text-right font-mono">{formatValue(p.value)}</td>
              <td className="px-4 py-3 text-muted-foreground">{p.formula}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
