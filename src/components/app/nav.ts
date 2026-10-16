import {
  BookOpen,
  Flag,
  House,
  LayoutDashboard,
  Library,
  type LucideIcon,
  MessagesSquare,
  Users,
} from "lucide-react";

export type Area = "student" | "teacher";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Session that builds the page. Items with `soon` render disabled. */
  soon?: string;
};

/** Sidebar navigation for each app. Flip `soon` off as sessions land. */
export const navigation: Record<Area, { label: string; items: NavItem[] }> = {
  student: {
    label: "Student",
    items: [
      { label: "Home", href: "/student", icon: House },
      { label: "My learning", href: "/student/learning", icon: BookOpen, soon: "S7" },
    ],
  },
  teacher: {
    label: "Teacher",
    items: [
      { label: "Overview", href: "/teacher", icon: LayoutDashboard },
      { label: "Courses", href: "/teacher/courses", icon: Library },
      { label: "Students", href: "/teacher/students", icon: Users },
      { label: "Flags", href: "/teacher/flags", icon: Flag },
      { label: "Lens", href: "/teacher/lens", icon: MessagesSquare },
    ],
  },
};

/** True if `href` is the current page or a section that contains it. */
export function isActive(pathname: string, href: string, areaRoot: string): boolean {
  if (href === areaRoot) return pathname === areaRoot;
  return pathname === href || pathname.startsWith(`${href}/`);
}
