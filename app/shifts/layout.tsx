import { requireStaff } from "@/lib/auth";
import { AppShell } from "@/app/shell/app-shell";

export default async function Layout({ children }: LayoutProps<"/shifts">) {
  const staff = await requireStaff();
  return <AppShell staff={staff}>{children}</AppShell>;
}
