import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NoInstitution } from "@/components/admin/no-institution";
import { PolicyForm } from "@/components/admin/policy-form";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isAtLeastAsStrict, listModes, modeLabels } from "@/lib/admin/policy";
import { adminContext, effectivePolicy, listDepartments, listPolicies } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "AI policy" };

export default function PolicyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Policy />
    </Suspense>
  );
}

async function Policy() {
  const { db, institution } = await adminContext();
  if (!institution) return <NoInstitution />;
  const [departments, policies] = await Promise.all([listDepartments(db, institution.id), listPolicies(db, institution.id)]);

  return (
    <>
      <PageHeader
        eyebrow="AI policy"
        title="Your college's AI policy"
        description="Decide how Sage may help with assignments. New assignments start from the policy, and teachers can only make them stricter unless you allow more."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <section aria-labelledby="college-title" className="min-w-0 rounded-lg border bg-surface p-6 lg:col-span-7">
          <h2 id="college-title" className="text-title">
            College default
          </h2>
          <p className="mb-6 text-small text-muted-foreground">
            {policies.college
              ? "Applies to every course whose department has no policy of its own, and to courses without a department."
              : "Not set yet: until you save one, teachers in departments without a policy may choose anything."}
          </p>
          <PolicyForm departmentId={null} policy={policies.college} idPrefix="college" />
        </section>

        <aside className="grid min-w-0 content-start gap-4 lg:col-span-5">
          <div className="rounded-lg border bg-surface p-6">
            <h2 className="text-title">How it works</h2>
            <ul className="mt-2 grid list-disc gap-2 pl-5 text-small text-muted-foreground">
              <li>
                <strong className="font-medium text-foreground">Modes.</strong> Learn gives hints, never the final answer. Assist
                explains fully but never writes the work. Exam turns Sage off.
              </li>
              <li>
                <strong className="font-medium text-foreground">Stricter only.</strong> Teachers may drop a mode, lower the hint step
                or switch worked examples off, but not the other way round.
              </li>
              <li>
                <strong className="font-medium text-foreground">Existing work.</strong> Assignments made before a change keep their
                settings until a teacher edits them.
              </li>
              <li>
                <strong className="font-medium text-foreground">Lab Mode</strong> is on or off per department.
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <section aria-labelledby="by-department-title" className="mt-8">
        <h2 id="by-department-title" className="text-title">
          By department
        </h2>
        <p className="mb-4 text-small text-muted-foreground">Open a department to give it its own policy.</p>
        {departments.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-surface/60 p-6 text-small text-muted-foreground">
            No departments yet.{" "}
            <Link href="/admin/departments" className="underline underline-offset-4 hover:text-foreground">
              Add your departments
            </Link>{" "}
            to set a policy for each.
          </p>
        ) : (
          <div className="rounded-lg border bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4 sm:pl-6">Department</TableHead>
                  <TableHead>Modes</TableHead>
                  <TableHead className="hidden sm:table-cell">Hints up to</TableHead>
                  <TableHead className="hidden md:table-cell">Worked examples</TableHead>
                  <TableHead className="hidden md:table-cell">Lab Mode</TableHead>
                  <TableHead className="hidden pr-6 lg:table-cell">Teachers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((d) => {
                  const { policy, source } = effectivePolicy(policies, d.id);
                  const looser = source === "department" && policies.college && policy && !isAtLeastAsStrict(policy, policies.college);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="pl-4 sm:pl-6">
                        <Link href={`/admin/departments/${d.id}`} className="inline-flex min-h-11 items-center font-medium hover:text-primary">
                          {d.name}
                        </Link>
                        <span className="block text-small text-muted-foreground">
                          {source === "department" ? "Own policy" : source === "college" ? "College default" : "Nothing set"}
                          {looser ? " · looser than the default" : ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        {policy ? (
                          <>
                            {listModes(policy.allowedModes)}
                            <span className="block text-small text-muted-foreground">starts in {modeLabels[policy.defaultMode]}</span>
                          </>
                        ) : (
                          <Badge variant="secondary">Any</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden font-mono sm:table-cell">{policy ? `Step ${policy.maxHintLevel}` : "–"}</TableCell>
                      <TableCell className="hidden md:table-cell">{policy ? (policy.workedExamples ? "On" : "Off") : "–"}</TableCell>
                      <TableCell className="hidden md:table-cell">{policy ? (policy.labModeAllowed ? "Allowed" : "Off") : "–"}</TableCell>
                      <TableCell className="hidden pr-6 text-muted-foreground lg:table-cell">
                        {policy ? (policy.teachersCanLoosen ? "May loosen" : "Stricter only") : "–"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
