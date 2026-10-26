import {
  BarChart3,
  BookOpen,
  Building2,
  FileStack,
  FileText,
  Flag,
  HandHelping,
  House,
  LayoutDashboard,
  Library,
  type LucideIcon,
  Scale,
  MessagesSquare,
  NotebookPen,
  Sparkles,
  UserRoundPlus,
  Users,
} from "lucide-react";

export type Area = "student" | "teacher" | "admin";

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
      { label: "Ask Sage", href: "/student/sage", icon: Sparkles },
      { label: "Writing", href: "/student/trace", icon: NotebookPen },
      { label: "My learning", href: "/student/learning", icon: BookOpen },
      { label: "Doubts", href: "/student/doubts", icon: HandHelping },
    ],
  },
  teacher: {
    label: "Teacher",
    items: [
      { label: "Overview", href: "/teacher", icon: LayoutDashboard },
      { label: "Courses", href: "/teacher/courses", icon: Library },
      { label: "Students", href: "/teacher/students", icon: Users },
      { label: "Submissions", href: "/teacher/submissions", icon: FileText },
      { label: "Flags", href: "/teacher/flags", icon: Flag },
      { label: "Doubts", href: "/teacher/doubts", icon: HandHelping },
      { label: "Lens", href: "/teacher/lens", icon: MessagesSquare },
      { label: "Course notes", href: "/teacher/materials", icon: FileStack },
    ],
  },
  // S23: the institution dashboard. Aggregates only.
  admin: {
    label: "Institution",
    items: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard },
      { label: "Departments", href: "/admin/departments", icon: Building2 },
      { label: "AI policy", href: "/admin/policy", icon: Scale },
      { label: "Courses", href: "/admin/courses", icon: Library },
      { label: "Teachers", href: "/admin/teachers", icon: UserRoundPlus },
      { label: "AI usage", href: "/admin/usage", icon: BarChart3 },
    ],
  },
};

/** True if `href` is the current page or a section that contains it. */
export function isActive(pathname: string, href: string, areaRoot: string): boolean {
  if (href === areaRoot) return pathname === areaRoot;
  return pathname === href || pathname.startsWith(`${href}/`);
}
