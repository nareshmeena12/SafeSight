import { AppHeader } from "@/components/app/app-header";

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return (
    <>
      <AppHeader home="/teacher" />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8">{children}</main>
    </>
  );
}
