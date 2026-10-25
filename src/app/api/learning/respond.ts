import { NextResponse } from "next/server";

/** JSON errors with a friendly message the page shows as is. */
export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export const busyMessage = "You've used this a lot in the last hour — take a short break and try again soon.";
