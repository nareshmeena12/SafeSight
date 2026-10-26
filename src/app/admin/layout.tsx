import { AppShell } from "@/components/app/app-shell";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AppShell area="admin">{children}</AppShell>;
}
