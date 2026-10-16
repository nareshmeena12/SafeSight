import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { computeSeatMetrics, csvHeader, csvRow, labSummary, toCsv } from "@/lib/lab/report";
import { loadLabReport } from "@/lib/lab/report-data";
import { labSessionIdSchema } from "@/lib/lab/schemas";
import { createClient } from "@/lib/supabase/server";

/** GET /api/lab/sessions/[sessionId]/csv — the session report as a spreadsheet (teacher of the course only). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/lab/sessions/[sessionId]/csv">) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "teacher" && user.role !== "admin")) {
    return NextResponse.json({ message: "Please sign in as a teacher." }, { status: 401 });
  }
  const parsed = labSessionIdSchema.safeParse({ sessionId: (await ctx.params).sessionId });
  if (!parsed.success) return NextResponse.json({ message: "Not found." }, { status: 404 });

  const data = await loadLabReport(await createClient(), parsed.data.sessionId);
  if (!data) return NextResponse.json({ message: "Not found." }, { status: 404 });
  if (!data.ended) return NextResponse.json({ message: "The report is ready when the session ends." }, { status: 409 });

  const rows = data.rows.map(({ seat, metrics, summary }) => {
    // Normally stored; recompute shape-safe defaults if a row is missing.
    const m =
      metrics ??
      computeSeatMetrics({ joinedAt: seat.joinedAt, lastHeartbeatAt: seat.lastHeartbeatAt, sessionEnd: Date.parse(seat.joinedAt), events: [] });
    return csvRow(seat, m, summary ?? labSummary(m));
  });
  const csv = toCsv([[...csvHeader], ...rows]);
  const slug = data.session.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "lab";
  const date = data.session.startsAt.slice(0, 10);

  return new NextResponse(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="safesight-lab-${slug}-${date}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
