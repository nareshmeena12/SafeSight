import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { classroomAuthUrl, classroomConfig } from "@/lib/integrations/google";

/** "Connect Google Classroom" (S25): teachers only; sends them to Google's consent screen. */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/teacher/integrations/google", origin));
  if (user.role === "student") return NextResponse.redirect(new URL("/student", origin));
  const cfg = classroomConfig();
  if (!cfg) return NextResponse.redirect(new URL("/teacher/integrations/google", origin));
  return NextResponse.redirect(await classroomAuthUrl(cfg, { origin, userId: user.id, email: user.email }));
}
