import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";
import { ReceiptCapture } from "./capture";

export const metadata = { title: "経費のレシート" };
// 送ったあと裏で AI が読むので、長めに
export const maxDuration = 300;

const STATUS: Record<string, { label: string; tone: string }> = {
  reading: { label: "AI が読んでいます", tone: "bg-slate-100 text-slate-600" },
  pending: { label: "本部の確認待ち", tone: "bg-amber-50 text-amber-700" },
  approved: { label: "処理済み", tone: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "差し戻し", tone: "bg-accent-soft/50 text-accent" },
};

/** 店の経費：レシートを続けて撮って本部に送る。下に自分が送った分 */
export default async function ExpensesCapturePage() {
  const me = await requireStaff();
  const admin = createAdminClient();
  const [{ data: self }, { data: stores }, { data: mine }] = await Promise.all([
    admin.from("staff").select("store_id").eq("id", me.id).single(),
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("expenses").select("id, status, expense_date, amount, vendor, reject_reason, created_at, store_id").eq("reporter_id", me.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="経費のレシート" description="店で買ったもの・払ったもののレシートを、続けて撮って本部に送ります。金額や勘定科目は入れなくて大丈夫です（AI が読み、本部が確かめます）" />
      <ReceiptCapture meId={me.id} stores={stores ?? []} defaultStore={self?.store_id ?? stores?.[0]?.id ?? ""} />
      <ul className="space-y-1 text-xs text-slate-500">
        <li>・レシート全体がまっすぐ、明るく写るように（金額・日付・お店の名前・登録番号）</li>
        <li>・1枚のレシートは1回で。長いレシートは、上下を分けずに少し離れて撮る</li>
        <li>・レシートの原本は、店の決まった場所に保管してください</li>
      </ul>

      <section className="space-y-2">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">自分が送ったレシート</h2>
        {mine?.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white text-sm">
            {mine.map((e) => (
              <li key={e.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums text-slate-500">{e.expense_date ? `${Number(e.expense_date.slice(5, 7))}/${Number(e.expense_date.slice(8, 10))}` : "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{e.vendor ?? storeName.get(e.store_id ?? "") ?? ""}</span>
                  {e.amount !== null && <span className="font-bold tabular-nums">{e.amount.toLocaleString()}円</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[e.status]?.tone}`}>{STATUS[e.status]?.label}</span>
                </div>
                {e.status === "rejected" && e.reject_reason && <p className="mt-1 text-xs font-bold text-accent">本部から：{e.reject_reason}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-line bg-white p-5 text-center text-sm text-slate-400">まだありません</p>
        )}
      </section>
    </div>
  );
}
