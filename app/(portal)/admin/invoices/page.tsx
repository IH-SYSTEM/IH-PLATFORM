import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { hasDuty } from "@/lib/duties";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvoiceUploader } from "./invoice-uploader";

export const metadata = { title: "請求書" };
export const maxDuration = 300;

const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
const STATUS: Record<string, { label: string; tone: string }> = {
  reading: { label: "AI が読んでいます", tone: "text-slate-400" },
  question: { label: "質問中", tone: "font-bold text-accent" },
  pending: { label: "確認待ち", tone: "font-bold text-amber-700" },
  approved: { label: "済", tone: "text-emerald-700" },
  rejected: { label: "差し戻し", tone: "text-slate-400" },
};

/**
 * 請求書（経理の担当と代表）。アップすると AI が店・勘定科目に振り分け、店 › 年 › 月 のフォルダに入る（請求日で）。
 * 店・勘定科目は、押すと開く画面でいつでも直せる（マネーフォワードに書き出す前まで）
 */
export default async function InvoicesPage({ searchParams }: PageProps<"/admin/invoices">) {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) redirect("/admin");
  const sp = await searchParams;
  const admin = createAdminClient();
  const [{ data: rows }, { data: stores }] = await Promise.all([
    admin
      .from("expenses")
      .select("id, status, store_id, expense_date, vendor, amount, account_title, due_date, exported_at, created_at")
      .eq("doc_type", "invoice")
      .neq("status", "rejected")
      .order("expense_date", { ascending: false, nullsFirst: true })
      .limit(2000),
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
  ]);
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const inbox = (rows ?? []).filter((r) => !r.store_id || !r.expense_date || ["reading", "question", "pending"].includes(r.status));
  const filed = (rows ?? []).filter((r) => r.store_id && r.expense_date);
  // フォルダ：店 › 年 › 月（請求日）
  const tree = new Map<string, Map<string, Map<string, number>>>();
  for (const r of filed) {
    const y = r.expense_date!.slice(0, 4);
    const m = r.expense_date!.slice(5, 7);
    const st = tree.get(r.store_id!) ?? new Map();
    const yr = st.get(y) ?? new Map();
    yr.set(m, (yr.get(m) ?? 0) + 1);
    st.set(y, yr);
    tree.set(r.store_id!, st);
  }
  const selStore = typeof sp.store === "string" ? sp.store : null;
  const selYm = typeof sp.ym === "string" && /^\d{4}-\d{2}$/.test(sp.ym) ? sp.ym : null;
  const list = selStore && selYm ? filed.filter((r) => r.store_id === selStore && r.expense_date!.startsWith(selYm)) : [];

  const row = (r: (typeof filed)[number]) => (
    <li key={r.id}>
      <Link href={`/admin/expenses/${r.id}`} className="grid grid-cols-[4rem_minmax(0,1fr)_6rem] items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 sm:grid-cols-[4rem_minmax(0,1fr)_7rem_6rem_6rem]">
        <span className="tabular-nums text-slate-500">{r.expense_date ? `${Number(r.expense_date.slice(5, 7))}/${Number(r.expense_date.slice(8, 10))}` : "—"}</span>
        <span className="min-w-0 truncate">
          <span className="text-slate-800">{r.vendor ?? "（取引先が読めません）"}</span>
          <span className={`ml-2 text-xs ${STATUS[r.status]?.tone}`}>{STATUS[r.status]?.label}</span>
          {r.exported_at && <span className="ml-2 text-xs text-slate-400">書き出し済</span>}
        </span>
        <span className="hidden truncate text-xs text-slate-500 sm:block">{r.account_title ?? "勘定科目なし"}</span>
        <span className="hidden text-xs tabular-nums text-slate-500 sm:block">{r.due_date ? `期日 ${Number(r.due_date.slice(5, 7))}/${Number(r.due_date.slice(8, 10))}` : ""}</span>
        <span className="text-right font-bold tabular-nums">{r.amount !== null ? yen(r.amount) : "—"}</span>
      </Link>
    </li>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">請求書</h1>
        <p className="mt-1 text-sm text-slate-500">取引先から届いた請求書をアップすると、AI が店と勘定科目に振り分けて、店 › 年 › 月のフォルダに入ります。振込（未払金）としてマネーフォワードのCSVにも出ます</p>
      </div>
      <InvoiceUploader meId={me.id} />

      {inbox.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">振り分け待ち（{inbox.length}枚）</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">{inbox.map(row)}</ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">フォルダ（店 › 年 › 月）</h2>
        {tree.size ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...tree.entries()].map(([sid, years]) => (
              <div key={sid} className="rounded-md border border-line bg-white p-4">
                <p className="font-bold text-slate-900">📁 {storeName.get(sid) ?? "（店）"}</p>
                {[...years.entries()]
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .map(([y, months]) => (
                    <div key={y} className="mt-2">
                      <p className="text-xs font-bold text-slate-500">{y}年</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {[...months.entries()]
                          .sort((a, b) => b[0].localeCompare(a[0]))
                          .map(([m, n]) => {
                            const on = selStore === sid && selYm === `${y}-${m}`;
                            return (
                              <Link key={m} href={`/admin/invoices?store=${sid}&ym=${y}-${m}`} className={`rounded-full px-2.5 py-1 text-xs font-bold ${on ? "bg-brand text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                                {Number(m)}月 <span className="font-normal opacity-70">{n}</span>
                              </Link>
                            );
                          })}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-line bg-white p-6 text-center text-sm text-slate-400">まだありません</p>
        )}
      </section>

      {selStore && selYm && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-800">
            {storeName.get(selStore)} › {selYm.slice(0, 4)}年{Number(selYm.slice(5))}月（{list.length}枚・{yen(list.reduce((a, r) => a + (r.amount ?? 0), 0))}）
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">{list.map(row)}</ul>
          <p className="text-xs text-slate-500">押すと請求書の画像と内容が開き、店・勘定科目を直せます。直した内容は、その取引先の次の請求書から使われます</p>
        </section>
      )}
    </div>
  );
}
