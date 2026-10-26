import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Download links for a report as PDF and Excel. */
export function ExportButtons({ href, disabled }: { href: string; disabled?: boolean }) {
  if (disabled) {
    return (
      <>
        <Button variant="outline" disabled>
          <FileText aria-hidden="true" />
          PDF
        </Button>
        <Button variant="outline" disabled>
          <FileSpreadsheet aria-hidden="true" />
          Excel
        </Button>
      </>
    );
  }
  return (
    <>
      <Button asChild variant="outline">
        <a href={`${href}?format=pdf`} download>
          <FileText aria-hidden="true" />
          Download PDF
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href={`${href}?format=xlsx`} download>
          <FileSpreadsheet aria-hidden="true" />
          Download Excel
        </a>
      </Button>
    </>
  );
}
