import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { canUseVault } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPartner } from "./actions";
import { CreatePartnerForm } from "./forms";

export const metadata = { title: "取引先（銀行）" };

/** 取引先（銀行）の一覧。銀行ごとに担当者の ID と、見せるもの（書類・月の売上）を決める */
export default async function PartnersPage() {
  const me = await requireAdmin();
  if (!canUseVault(me)) return <p className="text-sm text-slate-600">取引先（銀行）は、経理・総務の担当だけが扱えます</p>;
  const admin = createAdminClient();
  const [{ data: partners }, { data: users }, { data: shares }, { data: logs }] = await Promise.all([
    admin.from("partners").select("id, name, note, is_active").order("created_at"),
    admin.from("partner_users").select("partner_id, is_active, expires_on"),
    admin.from("partner_shares").select("partner_id, kind"),
    admin.from("partner_access_logs").select("partner_id, at").eq("action", "login").order("at", { ascending: false }).limit(500),
  ]);
  const lastLogin = (id: string) => (logs ?? []).find((l) => l.partner_id === id)?.at;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">取引先（銀行）</h1>
        <p className="mt-1 text-sm text-slate-500">
          銀行の担当者に ID を出して、選んだ書類と月ごとの売上を見てもらいます。担当者の入口は
          <span className="mx-1 font-mono text-slate-700">portal.ikkou-holdings.co.jp/exchange</span>
          （社内の画面には入れません）。ログインはパスワードとメールの確認コードの2段です
        </p>
      </div>
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">銀行を登録する</h2>
        <CreatePartnerForm action={createPartner} />
      </section>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">銀行</th>
              <th className="px-4 py-2.5 font-medium">担当者</th>
              <th className="px-4 py-2.5 font-medium">見せるもの</th>
              <th className="px-4 py-2.5 font-medium">最後のログイン</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(partners ?? []).map((p) => {
              const us = (users ?? []).filter((u) => u.partner_id === p.id);
              const sh = (shares ?? []).filter((s) => s.partner_id === p.id);
              const last = lastLogin(p.id);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/partners/${p.id}`} className="font-bold text-brand hover:underline">
                      {p.name}
                    </Link>
                    {!p.is_active && <span className="ml-2 rounded bg-slate-200 px-1.5 text-xs text-slate-600">止めています</span>}
                  </td>
                  <td className="px-4 py-2.5">{us.length}人</td>
                  <td className="px-4 py-2.5">
                    書類 {sh.filter((s) => s.kind === "file").length}件・売上 {sh.filter((s) => s.kind === "sales").length}社
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{last ? new Date(last).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</td>
                </tr>
              );
            })}
            {!(partners ?? []).length && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  まだありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
