import { requireStaff } from "@/lib/auth";
import { PortalHeader } from "@/app/portal-header";
import { MobileTabBar } from "@/app/mobile-tab-bar";

export default async function AttendanceLayout({ children }: LayoutProps<"/attendance">) {
  const staff = await requireStaff();
  return (
    <div className="min-h-screen">
      <PortalHeader staff={staff} />
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 lg:pb-16">{children}</main>
      <MobileTabBar />
    </div>
  );
}
