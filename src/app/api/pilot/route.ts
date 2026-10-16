import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pilotFieldErrors, pilotFormRoles, pilotRequestSchema } from "@/lib/pilot/schema";

/**
 * POST /api/pilot — the landing page's "Request a pilot" form.
 * Public (no login). Validates with zod, then inserts into `pilot_requests`
 * with the service role (the table has RLS on and no public policies).
 */

// Best-effort limit per IP: 5 requests per 10 minutes on this server instance.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function rateLimited(ip: string, now: number) {
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    recent.set(ip, hits);
    return true;
  }
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return false;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 10_000) throw new Error("too large");
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { message: "We couldn't read that request. Please try again." },
      { status: 400 },
    );
  }

  const parsed = pilotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Please check the highlighted fields.", fieldErrors: pilotFieldErrors(body) },
      { status: 400 },
    );
  }

  if (rateLimited(ip, Date.now())) {
    return NextResponse.json(
      { message: "We've received several requests from you already. Please try again later." },
      { status: 429 },
    );
  }

  const { name, role, institution, email, website } = parsed.data;
  // Honeypot filled in: answer as if it worked, store nothing.
  if (website) return NextResponse.json({ ok: true }, { status: 201 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pilot_requests")
    .insert({ name, institution, email, role: pilotFormRoles[role] });

  if (error) {
    console.error("pilot_requests insert failed", error.code, error.message);
    return NextResponse.json(
      { message: "We couldn't send your request just now. Please try again in a minute." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
