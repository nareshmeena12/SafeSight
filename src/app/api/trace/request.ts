import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/dal";
import type { Role } from "@/lib/auth/roles";
import { submissionIdSchema, traceBatchSchema, type TraceBatch } from "@/lib/trace/schemas";

export const jsonError = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

/** Checks the session and role, and validates the submission id. */
export async function authorize(
  params: Promise<{ submissionId: string }>,
  roles: readonly Role[],
): Promise<{ user: CurrentUser; submissionId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Please sign in again.");
  if (!roles.includes(user.role)) return jsonError(403, "This isn't available for your account.");
  const id = submissionIdSchema.safeParse((await params).submissionId);
  if (!id.success) return jsonError(404, "This piece of work wasn't found.");
  return { user, submissionId: id.data };
}

/** Parses a batch body. Accepts sendBeacon's text/plain bodies too. */
export async function readBatch(request: Request): Promise<TraceBatch | NextResponse> {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return jsonError(400, "That save didn't come through properly.");
  }
  const batch = traceBatchSchema.safeParse(body);
  if (!batch.success) return jsonError(400, "That save didn't come through properly.");
  return batch.data;
}
