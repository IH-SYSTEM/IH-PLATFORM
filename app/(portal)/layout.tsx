import { requireStaff } from "@/lib/auth";
import { AppShell } from "@/app/shell/app-shell";
import { DutyNotice } from "./duty-notice";

/**
 * ログイン後の画面の共通の枠（PCのサイドバー・スマホの上下のバー）。
 * ここで1回だけ作り、画面を移るときは中身だけを入れ替える（枠を毎回作り直さないので速い）
 */
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const staff = await requireStaff();
  return (
    <AppShell staff={staff}>
      <DutyNotice duties={staff.duties} isAdmin={staff.isAdmin} />
      {children}
    </AppShell>
  );
}
