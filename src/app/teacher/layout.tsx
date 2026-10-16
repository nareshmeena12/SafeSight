import { AppShell } from "@/components/app/app-shell";

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return <AppShell area="teacher">{children}</AppShell>;
}
