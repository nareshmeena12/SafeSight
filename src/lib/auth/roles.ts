import { z } from "zod";

export const roles = ["student", "teacher", "admin"] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

/** Roles a visitor may pick at sign-up. Admins are promoted by hand. */
export const signupRoles = ["student", "teacher"] as const satisfies readonly Role[];

const areas = {
  "/student": ["student"],
  // Admin analytics is v2; until then admins use the teacher app.
  "/teacher": ["teacher", "admin"],
} as const satisfies Record<string, readonly Role[]>;

type Area = keyof typeof areas;

function areaFor(pathname: string): Area | null {
  for (const area of Object.keys(areas) as Area[]) {
    if (pathname === area || pathname.startsWith(`${area}/`)) return area;
  }
  return null;
}

/** Where a user lands after logging in. */
export function homeForRole(role: Role): "/student" | "/teacher" {
  return role === "student" ? "/student" : "/teacher";
}

/** True for paths that need a signed-in user. */
export function isProtectedPath(pathname: string): boolean {
  return areaFor(pathname) !== null;
}

/** True if `role` may open `pathname`. Public paths are open to everyone. */
export function canAccess(pathname: string, role: Role): boolean {
  const area = areaFor(pathname);
  return area === null || (areas[area] as readonly Role[]).includes(role);
}

/**
 * Picks where to send a user after login: the `next` path they asked for if
 * it is a local path inside an area they can open, otherwise their home.
 */
export function redirectAfterLogin(role: Role, next?: string | null): string {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\") &&
    isProtectedPath(new URL(next, "http://x").pathname) &&
    canAccess(new URL(next, "http://x").pathname, role)
  ) {
    return next;
  }
  return homeForRole(role);
}
