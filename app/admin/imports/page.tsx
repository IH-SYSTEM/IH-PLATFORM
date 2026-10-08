import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";
import { importAirRegi } from "./actions";
import { ImportForm } from "./import-form";

export const metadata = { title: "データ取り込み" };

const when = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const md = (d: string | null) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");

// データ集積所の入口。いまはエアレジ（「一」・根っこ・COOKIE熊本）。ほかのレジ・会計はここに足していく
export default async function ImportsPage() {
  const admin = createAdminClient();
  const [{ data: stores }, { data: history }, { data: staff }] = await Promise.all([
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("pos_imports").select("id, store_id, file_name, receipts, date_from, date_to, imported_by, created_at").order("created_at", { ascending: false }).limit(30),
    admin.from("staff").select("id, name"),
  ]);
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="データ取り込み" description="レジのCSVを取り込むと、売上の画面に店舗別・日別で並びます" />
      <ImportForm stores={stores ?? []} action={importAirRegi} />
      <section>
        <h2 className="mb-3 text-xs font-bold tracking-[0.2em] text-slate-400">取り込んだ記録</h2>
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">日時</th>
                <th className="px-4 py-2.5 font-medium">店舗</th>
                <th className="px-4 py-2.5 font-medium">期間</th>
                <th className="px-4 py-2.5 text-right font-medium">会計</th>
                <th className="px-4 py-2.5 font-medium">取り込んだ人</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(history ?? []).map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-2.5 tabular-nums text-slate-500">{when(h.created_at)}</td>
                  <td className="px-4 py-2.5 font-bold text-slate-900">{storeName.get(h.store_id) ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {md(h.date_from)}〜{md(h.date_to)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{h.receipts}件</td>
                  <td className="px-4 py-2.5 text-slate-500">{(h.imported_by && staffName.get(h.imported_by)) ?? "—"}</td>
                </tr>
              ))}
              {!history?.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    まだありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
