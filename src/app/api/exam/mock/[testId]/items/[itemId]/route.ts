import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/app/api/learning/respond";
import { getCurrentUser } from "@/lib/auth/dal";
import { SAVE_GRACE_MS } from "@/lib/exam/grade";
import { mockAnswerSchema } from "@/lib/exam/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** PUT /api/exam/mock/<testId>/items/<itemId> — save one answer while the test runs (autosave). */
export async function PUT(req: Request, { params }: RouteContext<"/api/exam/mock/[testId]/items/[itemId]">) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in again.");
  if (user.role !== "student") return fail(403, "Mock tests are for students.");
  const { testId, itemId } = await params;
  if (!z.uuid().safeParse(testId).success || !z.uuid().safeParse(itemId).success) return fail(404, "We couldn't find this question.");
  const parsed = mockAnswerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "That answer didn't come through.");

  // Row-level security: the student's own test and item only.
  const db = await createClient();
  const [{ data: test }, { data: item }] = await Promise.all([
    db.from("mock_tests").select("id, ends_at, submitted_at").eq("id", testId).maybeSingle(),
    db.from("mock_test_items").select("id, test_id, format, options").eq("id", itemId).maybeSingle(),
  ]);
  if (!test || !item || item.test_id !== test.id) return fail(404, "We couldn't find this question.");
  if (test.submitted_at) return fail(409, "This test is already handed in.");
  if (Date.now() > Date.parse(test.ends_at) + SAVE_GRACE_MS) return fail(409, "Time's up for this test — it's being marked now.");

  const options = Array.isArray(item.options) ? item.options.length : 0;
  const update =
    item.format === "choice"
      ? { choice: parsed.data.choice !== null && parsed.data.choice !== undefined && parsed.data.choice < options ? parsed.data.choice : null }
      : { answer: parsed.data.answer ?? "" };
  const { error } = await createAdminClient()
    .from("mock_test_items")
    .update({ ...update, saved_at: new Date().toISOString() })
    .eq("id", item.id);
  if (error) return fail(500, "That answer didn't save. It's still in the box — we'll try again.");
  return NextResponse.json({ ok: true });
}
