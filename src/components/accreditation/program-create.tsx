"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Field } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createProgram, type ActionResult } from "@/lib/accreditation/actions";
import { cn } from "@/lib/utils";
import { StatusNote } from "./status-note";

/** A new programme, starting from the twelve NBA engineering POs or empty. */
export function ProgramCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [template, setTemplate] = useState<"nba" | "empty">("nba");
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await createProgram({ name, department, template });
      setStatus(result);
      if (result.status === "success" && result.programId) router.push(`/teacher/accreditation/programs/${result.programId}`);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          New programme
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New programme</DialogTitle>
          <DialogDescription>A degree programme with its POs and PSOs. Teachers in your institution can link their courses to it.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <Field name="program-name" label="Programme" placeholder="B.Tech Mechanical Engineering" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
          <Field
            name="program-department"
            label="Department"
            placeholder="Mechanical Engineering"
            hint="Optional"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            maxLength={120}
          />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-label">Start with</legend>
            {(
              [
                ["nba", "The twelve NBA engineering POs", "PO1–PO12 as most universities print them. Edit them and add your PSOs next."],
                ["empty", "An empty list", "Type your programme's own outcomes."],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors duration-150 ease-out",
                  template === value ? "border-primary bg-primary-soft" : "hover:bg-hover",
                )}
              >
                <input type="radio" name="template" value={value} checked={template === value} onChange={() => setTemplate(value)} className="mt-1 accent-[var(--ss-primary)]" />
                <span className="grid gap-0.5">
                  <span className="text-label">{label}</span>
                  <span className="text-small text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <StatusNote status={status?.status === "error" ? status : null} />
          <DialogFooter>
            <Button type="submit" disabled={pending || name.trim().length < 2}>
              {pending ? "Creating…" : "Create programme"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
