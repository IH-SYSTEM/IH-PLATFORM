import { requireAdmin } from "@/lib/auth";

export const metadata = { title: { default: "管理", template: "%s | 管理 | IKKOU HOLDINGS ポータル" } };

// 枠（サイドバー）は (portal) の layout が出す。ここでは管理者かどうかだけを確かめる
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return children;
}
