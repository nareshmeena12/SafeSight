import { AppShell } from "@/components/app/app-shell";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return <AppShell area="student">{children}</AppShell>;
}
