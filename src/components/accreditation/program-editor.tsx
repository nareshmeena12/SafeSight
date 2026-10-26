"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteProgram, saveProgram, type ActionResult } from "@/lib/accreditation/actions";
import { PO_LIMITS } from "@/lib/accreditation/outcomes";
import { StatusNote } from "./status-note";

type Row = { key: number; id?: string; code: string; title: string; description: string };

/** A programme's name, department and outcomes (POs, then PSOs). Only its maker or an institution admin sees this. */
export function ProgramEditor({
  program,
  outcomes,
}: {
  program: { id: string; name: string; department: string };
  outcomes: { id: string; code: string; title: string; description: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(program.name);
  const [department, setDepartment] = useState(program.department);
  const [rows, setRows] = useState<Row[]>(() => outcomes.map((o, i) => ({ key: i, ...o })));
  const nextKey = useRef(outcomes.length);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, by: number) =>
    setRows((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });
  const add = (prefix: "PO" | "PSO") => {
    const n = rows.filter((r) => r.code.toUpperCase().startsWith(prefix) && (prefix === "PSO" || !r.code.toUpperCase().startsWith("PSO"))).length + 1;
    setRows((list) => [...list, { key: nextKey.current++, code: `${prefix}${n}`, title: "", description: "" }]);
  };

  const save = () =>
    startTransition(async () => {
      setStatus(
        await saveProgram({
          programId: program.id,
          name,
          department,
          outcomes: rows.map(({ id, code, title, description }) => ({ id, code, title, description })),
        }),
      );
    });
  const remove = () => {
    if (!window.confirm(`Delete ${program.name}? Courses linked to it lose their CO–PO mapping.`)) return;
    startTransition(async () => {
      const result = await deleteProgram({ programId: program.id });
      if (result.status === "success") router.push("/teacher/accreditation");
      else setStatus(result);
    });
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="program-name">Programme</Label>
          <Input id="program-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={PO_LIMITS.name} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="program-department">Department</Label>
          <Input id="program-department" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={PO_LIMITS.department} />
        </div>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-label">Outcomes</legend>
        <ol className="grid gap-3">
          {rows.map((r, i) => (
            <li key={r.key} className="grid gap-3 rounded-md border p-3">
              <div className="flex items-end gap-2">
                <div className="grid w-24 shrink-0 gap-1.5">
                  <Label htmlFor={`po-${r.key}-code`}>Code</Label>
                  <Input id={`po-${r.key}-code`} value={r.code} onChange={(e) => update(r.key, { code: e.target.value })} maxLength={PO_LIMITS.code} className="font-mono" />
                </div>
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <Label htmlFor={`po-${r.key}-title`}>Short title</Label>
                  <Input id={`po-${r.key}-title`} value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} maxLength={PO_LIMITS.title} placeholder="Engineering knowledge" />
                </div>
                <div className="hidden shrink-0 sm:flex">
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${r.code || "outcome"} up`}>
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move ${r.code || "outcome"} down`}>
                    <ArrowDown aria-hidden="true" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                  aria-label={`Remove ${r.code || "outcome"}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`po-${r.key}-desc`}>Statement</Label>
                <Textarea id={`po-${r.key}-desc`} rows={2} value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} maxLength={PO_LIMITS.description} />
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => add("PO")} disabled={rows.length >= PO_LIMITS.outcomes}>
            <Plus aria-hidden="true" />
            Add PO
          </Button>
          <Button type="button" variant="outline" onClick={() => add("PSO")} disabled={rows.length >= PO_LIMITS.outcomes}>
            <Plus aria-hidden="true" />
            Add PSO
          </Button>
        </div>
        <p className="text-small text-muted-foreground">
          The NBA wording changes between versions and universities print it slightly differently: check these against the version your programme uses. Removing an
          outcome removes its column from every course&apos;s mapping.
        </p>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center">
        <Button type="button" variant="ghost" onClick={remove} disabled={pending} className="sm:mr-auto">
          <Trash2 aria-hidden="true" />
          Delete programme
        </Button>
        <StatusNote status={status} />
        <Button type="button" onClick={save} disabled={pending || name.trim().length < 2}>
          {pending ? "Saving…" : "Save programme"}
        </Button>
      </div>
    </div>
  );
}
