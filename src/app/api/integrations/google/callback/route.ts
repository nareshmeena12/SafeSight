import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { classroomConfig, finishClassroomAuth } from "@/lib/integrations/google";
import { LmsError } from "@/lib/integrations/http";

/** Google sends the teacher back here after the Classroom consent screen (S25). */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const page = new URL("/teacher/integrations/google", origin);
  const user = await getCurrentUser();
  if (!user || user.role === "student") return NextResponse.redirect(new URL("/login", origin));
  const cfg = classroomConfig();
  if (!cfg) return NextResponse.redirect(page);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (searchParams.get("error") || !code || !state) {
    page.searchParams.set("error", searchParams.get("error") === "access_denied" ? "cancelled" : "failed");
    return NextResponse.redirect(page);
  }
  try {
    await finishClassroomAuth(cfg, { origin, userId: user.id, code, state });
  } catch (e) {
    console.warn("classroom connect:", e instanceof Error ? e.message : e);
    page.searchParams.set("error", e instanceof LmsError && e.status === 403 ? "scopes" : "failed");
  }
  return NextResponse.redirect(page);
}
