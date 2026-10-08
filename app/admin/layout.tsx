import { requireAdmin } from "@/lib/auth";
import { AppShell } from "@/app/shell/app-shell";

export const metadata = { title: { default: "管理", template: "%s | 管理 | IKKOU HOLDINGS ポータル" } };

// 管理の画面も、ほかの画面と同じ枠（サイドバー）を使う。ここでは管理者かどうかだけを確かめる
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const me = await requireAdmin();
  return <AppShell staff={me}>{children}</AppShell>;
}
