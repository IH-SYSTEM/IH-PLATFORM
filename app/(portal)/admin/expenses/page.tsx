import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { hasDuty } from "@/lib/duties";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "経費" };

const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
const shiftMonth = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

/**
 * 店の経費（2026-10-16）。報告窓口の「経費の報告」を承認したものが月ごとに並ぶ。勘定科目・税率などを直せる。
 * マネーフォワード用の CSV の書き出しは、見本の CSV に形を合わせてから足す。経理の担当と代表だけ
 */
export default async function ExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) return <p className="text-sm text-slate-600">経費は、経理の担当だけが見られます</p>;
  const sp = await searchParams;
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : businessDayJST().slice(0, 7);
  const storeFilter = typeof sp.store === "string" ? sp.store : "";
  const admin = createAdminClient();
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  let q = admin.from("expenses").select("*").eq("status", "approved").gte("expense_date", `${month}-01`).lte("expense_date", last).order("expense_date").order("created_at");
  if (storeFilter) q = q.eq("store_id", storeFilter);
  const [{ data: rows }, { data: stores }, { data: pending }, { data: oldReports }] = await Promise.all([
    q,
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("expenses").select("id").in("status", ["reading", "pending"]),
    admin.from("reports").select("id").eq("type", "site.expense").eq("status", "pending"),
  ]);
  const ids = [...new Set((rows ?? []).map((r) => r.reporter_id).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await admin.from("staff").select("id, name").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, p.name]));
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const total = (rows ?? []).reduce((a, r) => a + (r.amount ?? 0), 0);
  const byTitle = new Map<string, number>();
  const byStore = new Map<string, number>();
  for (const r of rows ?? []) {
    byTitle.set(r.account_title ?? "（未設定）", (byTitle.get(r.account_title ?? "（未設定）") ?? 0) + (r.amount ?? 0));
    byStore.set(r.store_id ?? "", (byStore.get(r.store_id ?? "") ?? 0) + (r.amount ?? 0));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">経費</h1>
        <p className="mt-1 text-sm text-slate-500">店が撮って送ったレシートを AI が読み、本部が確かめて承認したものが並びます。押すと写真を見ながら直せます（マネーフォワードに書き出す前まで）</p>
      </div>

      <Link href="/admin/expenses/review" className={`block rounded-md border px-4 py-3 text-sm font-bold ${(pending ?? []).length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-line bg-white text-slate-600"}`}>
        {(pending ?? []).length ? `届いたレシートの確認待ちが ${(pending ?? []).length}件あります → 確認をはじめる` : "届いたレシートの確認待ちはありません"}
      </Link>
      {(oldReports ?? []).length > 0 && (
        <Link href="/admin/reports" className="block text-xs text-amber-800 underline">
          前のやり方（報告窓口）の経費の報告が {(oldReports ?? []).length}件 残っています → 報告の受付へ
        </Link>
      )}

      <form className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`?m=${shiftMonth(month, -1)}${storeFilter ? `&store=${storeFilter}` : ""}`} className="rounded-md px-3 py-2 text-slate-600 hover:bg-slate-100">
          ‹ 前の月
        </Link>
        <span className="font-bold text-slate-800">
          {month.slice(0, 4)}年{Number(month.slice(5))}月
        </span>
        <Link href={`?m=${shiftMonth(month, 1)}${storeFilter ? `&store=${storeFilter}` : ""}`} className="rounded-md px-3 py-2 text-slate-600 hover:bg-slate-100">
          次の月 ›
        </Link>
        <input type="hidden" name="m" value={month} />
        <select name="store" defaultValue={storeFilter} className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="">すべての店</option>
          {(stores ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="rounded-lg bg-slate-800 px-3 py-2 font-bold text-white">絞り込む</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">合計（税込）</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{yen(total)}</p>
          <p className="text-xs text-slate-400">{(rows ?? []).length}件</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm">
          <p className="text-xs text-slate-500">勘定科目ごと</p>
          {[...byTitle].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <p key={k} className="flex justify-between tabular-nums">
              <span>{k}</span>
              <span>{yen(v)}</span>
            </p>
          ))}
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm">
          <p className="text-xs text-slate-500">店ごと</p>
          {[...byStore].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <p key={k} className="flex justify-between tabular-nums">
              <span>{storeName.get(k) ?? "—"}</span>
              <span>{yen(v)}</span>
            </p>
          ))}
        </div>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="hidden grid-cols-[5.5rem_8rem_6.5rem_3.5rem_7rem_minmax(0,1fr)_4rem] gap-x-3 border-b border-slate-200 pb-1.5 text-xs text-slate-400 md:grid">
          <span>日付</span>
          <span>店</span>
          <span className="text-right">金額</span>
          <span>税率</span>
          <span>勘定科目</span>
          <span>何を・何に（お店）</span>
          <span>レシート</span>
        </div>
        {!(rows ?? []).length && <p className="py-4 text-sm text-slate-400">この月の経費はまだありません</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="py-2">
              <Link href={`/admin/expenses/${r.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 hover:bg-slate-50 md:grid-cols-[5.5rem_8rem_6.5rem_3.5rem_7rem_minmax(0,1fr)_4rem]">
                <span className="tabular-nums text-slate-600">{r.expense_date ? `${Number(r.expense_date.slice(5, 7))}/${Number(r.expense_date.slice(8, 10))}` : "—"}</span>
                <span className="truncate text-slate-600">{storeName.get(r.store_id ?? "") ?? "—"}</span>
                <span className="text-right font-bold tabular-nums text-slate-900">{yen(r.amount ?? 0)}</span>
                <span className="hidden text-slate-500 md:block">{r.tax_rate === 0 ? "対象外" : `${r.tax_rate}%`}</span>
                <span className={`hidden md:block ${r.account_title ? "text-slate-800" : "text-amber-700"}`}>{r.account_title ?? "未設定"}</span>
                <span className="col-span-2 truncate text-slate-700 md:col-span-1">
                  {r.item}
                  <span className="text-xs text-slate-400">
                    {r.purpose ? `／${r.purpose}` : ""}
                    {r.vendor ? `（${r.vendor}）` : ""}
                  </span>
                </span>
                <span className="hidden text-xs md:block">
                  {r.exported_at ? <span className="text-emerald-700">書き出し済</span> : <span className="text-brand">見る・直す</span>}
                </span>
              </Link>
              <div className="mt-0.5 text-xs text-slate-400">
                {r.payment_method === "cash" ? "店の現金" : "振込"}・{name.get(r.reporter_id ?? "") ?? "—"}
                {r.invoice_number ? `・${r.invoice_number}` : "・登録番号なし"}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <MfExportPanel month={month} />
    </div>
  );
}

/** マネーフォワード用の CSV（会社ごと）。勘定科目が決まっていて、まだ書き出していない経費だけを出す */
async function MfExportPanel({ month }: { month: string }) {
  const admin = createAdminClient();
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [{ data: companies }, { data: rows }] = await Promise.all([
    admin.from("companies").select("id, name").eq("is_active", true).order("sort_order"),
    admin.from("expenses").select("company_id, exported_at, amount, expense_lines(account_title)").eq("status", "approved").gte("expense_date", `${month}-01`).lte("expense_date", last),
  ]);
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-bold text-slate-800">マネーフォワードに取り込む CSV（{Number(month.slice(5))}月）</h2>
      <p className="mt-1 text-xs text-slate-500">
        会社ごとに、マネーフォワードの「仕訳帳」に取り込める形（見本と同じ列・Shift_JIS）で出します。まず「確かめる用」で中身を見て、よければ「書き出して済みにする」を押してください（次からは出ないので、二重に取り込みません）
      </p>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {(companies ?? []).map((c) => {
          const mine = (rows ?? []).filter((r) => r.company_id === c.id);
          const done_ = (r: (typeof mine)[number]) => r.expense_lines.length > 0 && r.expense_lines.every((l) => l.account_title);
          const ready = mine.filter((r) => done_(r) && !r.exported_at);
          const missing = mine.filter((r) => !done_(r) && !r.exported_at).length;
          const done = mine.filter((r) => r.exported_at).length;
          const href = `/admin/expenses/export?m=${month}&company=${c.id}`;
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-bold text-slate-800">{c.name.replace("株式会社", "")}</span>
                <span className="ml-2 text-xs text-slate-500">
                  書き出せる {ready.length}件（{yen(ready.reduce((a, r) => a + (r.amount ?? 0), 0))}）
                  {missing > 0 && <span className="ml-1 text-amber-700">・勘定科目が未設定 {missing}件（出ません）</span>}
                  {done > 0 && <span className="ml-1 text-emerald-700">・書き出し済み {done}件</span>}
                </span>
              </span>
              {ready.length > 0 && (
                <span className="flex gap-2">
                  <a href={href} className="rounded-md px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-300">
                    確かめる用
                  </a>
                  <a href={`${href}&mark=1`} className="rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white">
                    書き出して済みにする
                  </a>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
