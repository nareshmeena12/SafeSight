import { NextResponse, type NextRequest } from "next/server";
import { heartbeatSchema } from "@/lib/lab/schemas";
import { heartbeat } from "@/lib/lab/seat";
import { bearerToken } from "@/lib/lab/tokens";

/**
 * POST /api/lab/heartbeat — every 10 s from the SafeSight Lab extension, with
 * the events recorded since the last call (S13). Authorised by the seat token
 * from /api/lab/join. `session.active: false` tells the extension to stop.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ message: "This seat isn't recording." }, { status: 401 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 100_000) throw new Error("too large");
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ message: "We couldn't read that request." }, { status: 400 });
  }
  const parsed = heartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "We couldn't read that request." }, { status: 400 });
  }

  try {
    const result = await heartbeat({ token, ...parsed.data });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
    return NextResponse.json({ session: result.session });
  } catch (error) {
    console.error("lab heartbeat failed", error);
    return NextResponse.json({ message: "Something went wrong. We'll try again." }, { status: 500 });
  }
}
