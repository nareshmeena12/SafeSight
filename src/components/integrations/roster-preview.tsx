import type { ParsedRoster } from "@/lib/setup/roster";

/** The students an LMS class would bring in (server-read, first 50 shown). */
export function RosterPreview({ roster }: { roster: ParsedRoster }) {
  if (!roster.rows.length && !roster.warnings.length) {
    return <p className="text-small text-muted-foreground">This class has no students yet.</p>;
  }
  return (
    <div className="grid gap-2">
      {roster.rows.length ? (
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-left text-small">
            <thead className="sticky top-0 bg-surface text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-normal">Name</th>
                <th scope="col" className="px-3 py-2 font-normal">Email</th>
                <th scope="col" className="hidden px-3 py-2 font-normal sm:table-cell">Roll number</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {roster.rows.slice(0, 50).map((r) => (
                <tr key={r.email}>
                  <td className="px-3 py-2">{r.name || <span className="text-muted-foreground">—</span>}</td>
                  <td className="max-w-[11rem] truncate px-3 py-2 font-mono sm:max-w-none">{r.email}</td>
                  <td className="hidden px-3 py-2 font-mono sm:table-cell">{r.rollNumber ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {roster.rows.length > 50 ? <p className="border-t px-3 py-2 text-small text-muted-foreground">…and {roster.rows.length - 50} more</p> : null}
        </div>
      ) : null}
      {roster.warnings.length ? (
        <p className="text-small text-muted-foreground">
          {roster.warnings.length} {roster.warnings.length === 1 ? "student has" : "students have"} no email address we can see and won&apos;t be added. They can still join with the course&apos;s join code.
        </p>
      ) : null}
    </div>
  );
}
