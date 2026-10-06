import { requireStaff } from "@/lib/auth";
import { PortalHeader } from "@/app/portal-header";
import { MobileTabBar } from "@/app/mobile-tab-bar";

export default async function StaffLayout({ children }: LayoutProps<"/me">) {
  const staff = await requireStaff();

  return (
    <div className="min-h-screen print:bg-white">
      <PortalHeader staff={staff} />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-5 lg:pb-16">
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}
