import { FileText } from "lucide-react";
import type { Citation } from "@/lib/sage/types";

/** Pages of the course notes Sage used, as chips that open the PDF at that page. */
export function CitationChips({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="From your course notes">
      {citations.map((c) => (
        <li key={`${c.materialId}-${c.page}`}>
          <a
            href={`/api/materials/${c.materialId}/file${c.page ? `?page=${c.page}` : ""}`}
            target="_blank"
            rel="noreferrer"
            className="relative inline-flex h-9 max-w-[16rem] items-center gap-1.5 rounded-full border bg-surface px-3 text-small transition-colors duration-150 ease-out before:absolute before:inset-x-0 before:-inset-y-1 hover:border-border-strong"
          >
            <FileText className="size-3.5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
            <span className="truncate">{c.title}</span>
            {c.page ? <span className="shrink-0 font-mono text-muted-foreground">p. {c.page}</span> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
