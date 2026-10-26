import "server-only";
import { renderReportPdf } from "./pdf";
import type { ReportDoc } from "./report";
import { renderReportXlsx } from "./xlsx";

export type ExportFormat = "pdf" | "xlsx";

/** The report as a download (PDF or Excel), never cached. */
export async function reportResponse(doc: ReportDoc, format: ExportFormat): Promise<Response> {
  const body = format === "pdf" ? await renderReportPdf(doc) : await renderReportXlsx(doc);
  const type = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(new Blob([body as BlobPart], { type }), {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename="${doc.fileBase}.${format}"`,
      "cache-control": "private, no-store",
    },
  });
}
