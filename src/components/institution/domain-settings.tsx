"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Field } from "@/components/auth/field";
import { ErrorNote, SuccessNote } from "@/components/integrations/notes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { addDomain, removeDomain, setDomainsOnly } from "@/lib/institution/actions";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

/** The institution's email domains and the "only these domains" switch (S25). */
export function DomainSettings({ domains, domainsOnly }: { domains: string[]; domainsOnly: boolean }) {
  const [addState, addAction, adding] = useActionState(addDomain, initial);
  const [toggleState, toggleAction] = useActionState(setDomainsOnly, initial);
  const [optimistic, setOptimistic] = useOptimistic(domainsOnly);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        {domains.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Email domains">
            {domains.map((d) => (
              <li key={d} className="flex items-center gap-1 rounded-full border bg-background py-1 pr-1 pl-3 font-mono text-small">
                @{d}
                <form action={removeDomain}>
                  <input type="hidden" name="domain" value={d} />
                  <Button type="submit" variant="ghost" size="icon" className="rounded-full" aria-label={`Remove ${d}`}>
                    <X aria-hidden="true" />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-muted-foreground">No domains yet. Add the part after the @ in your college&apos;s email addresses.</p>
        )}
        <form action={addAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start" noValidate>
          <Field
            name="domain"
            label="Add a domain"
            placeholder="college.edu.in"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            error={addState.fieldErrors?.domain}
            hint="Subdomains count too: students.college.edu.in is part of college.edu.in."
          />
          <Button type="submit" variant="outline" disabled={adding} className="sm:mt-7">
            <Plus aria-hidden="true" />
            {adding ? "Adding…" : "Add"}
          </Button>
        </form>
        <ErrorNote message={addState.status === "error" ? addState.message : undefined} />
      </div>

      <div className="flex items-start justify-between gap-4 border-t pt-6">
        <div className="grid gap-1">
          <Label htmlFor="domains-only">Only these domains can join</Label>
          <p id="domains-only-hint" className="text-small text-muted-foreground">
            When on, people with other email addresses can&apos;t join your courses with a class code or be invited as teachers. Students your
            teachers invite by name from a class list still can.
          </p>
        </div>
        <Switch
          id="domains-only"
          checked={optimistic}
          disabled={pending || (!domains.length && !optimistic)}
          aria-describedby="domains-only-hint"
          className="mt-1"
          onCheckedChange={(next) =>
            start(async () => {
              setOptimistic(next);
              const data = new FormData();
              if (next) data.set("domainsOnly", "on");
              await toggleAction(data);
            })
          }
        />
      </div>
      {toggleState.status === "error" ? <ErrorNote message={toggleState.message} /> : <SuccessNote message={toggleState.message} />}
    </div>
  );
}
