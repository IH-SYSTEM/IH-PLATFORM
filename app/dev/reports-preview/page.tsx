import { notFound } from "next/navigation";
import type { CurrentStaff } from "@/lib/auth";
import { AppShell } from "@/app/shell/app-shell";
import { PageHeader } from "@/app/shell/page-header";
import { ReportCatalog } from "@/app/reports/report-catalog";

// 開発中だけ使う、報告窓口の入口の見た目の確認用（本番では 404。本番ではログインも必要）
export default async function ReportsPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const fake: CurrentStaff = { id: "preview", name: "田中　眞佐代", email: null, role: "parttime", permission: "member", isAdmin: false, lineLinked: true, lineFriend: true };
  return (
    <AppShell staff={fake}>
      <PageHeader title="報告窓口" description="困ったこと・届け・トラブルは、すべてここから本部に送ります。本部が確認し、結果をLINEでお知らせします" />
      <ReportCatalog />
    </AppShell>
  );
}
