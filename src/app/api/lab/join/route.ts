import { NextResponse, type NextRequest } from "next/server";
import { createLimiter } from "@/lib/lab/rate-limit";
import { joinSchema } from "@/lib/lab/schemas";
import { joinSeat } from "@/lib/lab/seat";

/**
 * POST /api/lab/join — the SafeSight Lab extension joins a session with the
 * 6-digit code and the student's roll number (S13). Public: the code is the
 * key. Returns a seat token for /api/lab/heartbeat and the session settings.
 */

const wrongCodes = createLimiter(30, 10 * 60_000);
const joins = createLimiter(600, 10 * 60_000);

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (wrongCodes.blocked(ip) || joins.blocked(ip)) {
    return NextResponse.json(
      { message: "Too many tries from this network. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }
  joins.hit(ip);

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 2_000) throw new Error("too large");
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ message: "We couldn't read that request. Please try again." }, { status: 400 });
  }

  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the code and roll number.";
    return NextResponse.json({ message }, { status: 400 });
  }

  try {
    const result = await joinSeat(parsed.data);
    if (!result.ok) {
      if (result.reason === "unknown_code") wrongCodes.hit(ip);
      return NextResponse.json({ message: result.message, reason: result.reason }, { status: result.status });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("lab join failed", error);
    return NextResponse.json(
      { message: "We couldn't start the session just now. Please try again in a moment." },
      { status: 500 },
    );
  }
}
