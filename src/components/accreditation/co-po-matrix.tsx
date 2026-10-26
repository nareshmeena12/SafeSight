"use client";

import { useMemo, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveMatrix, type ActionResult } from "@/lib/accreditation/actions";
import type { SuggestedCell } from "@/lib/accreditation/suggest";
import { cn } from "@/lib/utils";
import { StatusNote } from "./status-note";

type Cell = { level: number; justification: string; suggested?: boolean };
const key = (co: string, po: string) => `${co}:${po}`;

/**
 * The CO–PO mapping matrix (levels 1–3). "Suggest a mapping" asks the model
 * for levels with a reason each; suggestions only fill the grid, and nothing
 * is stored until the teacher saves.
 */
export function CoPoMatrix({
  courseId,
  outcomes,
  programOutcomes,
  mappings,
  aiReady,
}: {
  courseId: string;
  outcomes: { id: string; code: string; description: string }[];
  programOutcomes: { id: string; code: string; title: string; description: string }[];
  mappings: { outcomeId: string; programOutcomeId: string; level: number; justification?: string }[];
  aiReady: boolean;
}) {
  const initial = useMemo(
    () => new Map(mappings.map((m) => [key(m.outcomeId, m.programOutcomeId), { level: m.level, justification: m.justification ?? "" } as Cell])),
    [mappings],
  );
  const [cells, setCells] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (co: string, po: string, level: number) => {
    setCells((prev) => {
      const next = new Map(prev);
      if (level === 0) next.delete(key(co, po));
      else next.set(key(co, po), { level, justification: prev.get(key(co, po))?.justification ?? "" });
      return next;
    });
    setDirty(true);
  };

  async function suggest() {
    setSuggesting(true);
    setStatus(null);
    const res = await fetch(`/api/accreditation/courses/${courseId}/suggest`, { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { cells?: SuggestedCell[]; error?: string } | null;
    setSuggesting(false);
    if (!res?.ok || !body?.cells) {
      setStatus({ status: "error", message: body?.error ?? "We couldn't suggest a mapping just now. Please try again." });
      return;
    }
    setCells(new Map(body.cells.map((c) => [key(c.outcomeId, c.programOutcomeId), { level: c.level, justification: c.why, suggested: true }])));
    setDirty(true);
    setStatus({ status: "success", message: `Suggested ${body.cells.length} cells. Check each one, change what doesn't fit, then save.` });
  }

  const save = () =>
    startTransition(async () => {
      const result = await saveMatrix({
        courseId,
        cells: [...cells].map(([k, c]) => {
          const [outcomeId, programOutcomeId] = k.split(":");
          return { outcomeId, programOutcomeId, level: c.level, justification: c.justification };
        }),
      });
      setStatus(result);
      if (result.status === "success") {
        setDirty(false);
        setCells((prev) => new Map([...prev].map(([k, c]) => [k, { ...c, suggested: false }])));
      }
    });

  const averages = programOutcomes.map((po) => {
    const levels = outcomes.map((o) => cells.get(key(o.id, po.id))?.level ?? 0).filter(Boolean);
    return levels.length ? (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(2) : "–";
  });
  const reasons = outcomes.flatMap((o) =>
    programOutcomes.flatMap((po) => {
      const c = cells.get(key(o.id, po.id));
      return c?.justification ? [{ co: o.code, po: po.code, level: c.level, why: c.justification, suggested: c.suggested }] : [];
    }),
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={suggest} disabled={!aiReady || suggesting || pending}>
          <Sparkles aria-hidden="true" />
          {suggesting ? "Suggesting…" : "Suggest a mapping"}
        </Button>
        {!aiReady ? <span className="text-small text-muted-foreground">Suggestions need the AI model, which isn&apos;t set up yet.</span> : null}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-max border-collapse text-small">
          <caption className="sr-only">CO–PO mapping: 3 high, 2 medium, 1 low, blank not mapped</caption>
          <thead>
            <tr className="border-b bg-hover">
              <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium">
                CO
              </th>
              {programOutcomes.map((po) => (
                <th key={po.id} scope="col" className="px-1 py-2 text-center font-mono font-medium" title={po.title || po.description}>
                  {po.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1 text-left font-mono font-medium text-primary" title={o.description}>
                  {o.code}
                </th>
                {programOutcomes.map((po) => {
                  const c = cells.get(key(o.id, po.id));
                  return (
                    <td key={po.id} className="px-1 py-1 text-center">
                      <select
                        aria-label={`${o.code} to ${po.code}`}
                        title={c?.justification || undefined}
                        value={c?.level ?? 0}
                        onChange={(e) => set(o.id, po.id, Number(e.target.value))}
                        disabled={pending}
                        className={cn(
                          "h-11 w-14 rounded-md border bg-surface text-center font-mono transition-colors outline-none hover:border-border-strong focus-visible:border-primary",
                          c?.level ? "border-primary/40 text-foreground" : "text-muted-foreground",
                          c?.suggested && "bg-primary-soft",
                        )}
                      >
                        <option value={0}>–</option>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t bg-hover">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium">
                Average
              </th>
              {averages.map((a, i) => (
                <td key={programOutcomes[i].id} className="px-1 py-2 text-center font-mono">
                  {a}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-small text-muted-foreground">3 = high, 2 = medium, 1 = low, – = not mapped. Hover a code to read its statement.</p>

      {reasons.length ? (
        <details className="rounded-md border p-4">
          <summary className="min-h-6 cursor-pointer text-label">Reasons for the mapping ({reasons.length})</summary>
          <ul className="mt-3 grid gap-2 text-small">
            {reasons.map((r) => (
              <li key={`${r.co}-${r.po}`} className="grid gap-1 sm:grid-cols-[9rem_1fr]">
                <span className="font-mono text-muted-foreground">
                  {r.co} → {r.po} ({r.level})
                </span>
                <span>
                  {r.why}
                  {r.suggested ? <span className="ml-2 text-muted-foreground">(suggested)</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <StatusNote status={status} className="sm:mr-auto" />
        {dirty ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCells(initial);
              setDirty(false);
              setStatus(null);
            }}
            disabled={pending}
          >
            Undo changes
          </Button>
        ) : null}
        <Button type="button" onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save mapping"}
        </Button>
      </div>
    </div>
  );
}
