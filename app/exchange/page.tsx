import { VAULT_CATEGORIES, formatBytes } from "@/lib/files";
import { logPartner, requirePartner } from "@/lib/partner-auth";
import { monthlySales, sharesOf } from "@/lib/partner-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { partnerLogout } from "./actions";
import { BankUploader } from "./bank-uploader";

export const metadata = { title: "資料" };

type Doc = { id: string; name: string; category: string; doc_kind: string | null; doc_date: string | null; size_bytes: number; owner_company_id: string | null };

const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
const man = (n: number) => `${(Math.round(n / 1000) / 10).toLocaleString()}万円`;
const ymd = (d: string) => `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
const month = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;
const short = (name: string | undefined) => (name ?? "").replace("株式会社", "");

/** 書類1つ分のカード（スマホで押しやすい大きさ。ファイル名ではなく、何の書類かを大きく出す） */
function DocCard({ f, title, sub }: { f: Doc; title: string; sub: string }) {
  return (
    <li>
      <a href={`/exchange/files/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 active:bg-slate-50">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-xs font-bold text-brand">PDF</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-slate-900">{title}</span>
          <span className="block truncate text-xs text-slate-500">{sub}</span>
        </span>
        <span className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-bold text-white">開く</span>
      </a>
    </li>
  );
}

/** 取引先（銀行）の画面：お渡しした書類・会社ごとの月の売上・書類のお預かり（スマホで見やすい形） */
export default async function ExchangeHome() {
  const me = await requirePartner();
  const admin = createAdminClient();
  const { fileIds, companyIds } = await sharesOf(me.partnerId);
  const [{ data: files }, { data: companies }, { data: mine }] = await Promise.all([
    fileIds.length
      ? admin.from("files").select("id, name, category, doc_kind, doc_date, size_bytes, owner_company_id").in("id", fileIds).eq("status", "ready").order("doc_date", { ascending: false, nullsFirst: false }).returns<Doc[]>()
      : Promise.resolve({ data: [] as Doc[] }),
    admin.from("companies").select("id, name").order("sort_order"),
    admin.from("files").select("id, name, created_at, size_bytes").eq("owner_partner_id", me.partnerId).eq("status", "ready").order("created_at", { ascending: false }),
  ]);
  const order = (companies ?? []).map((c) => c.id);
  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]));
  // 決算書は会社ごとに、期の新しい順
  const fin = (files ?? []).filter((f) => f.category === "corp_financials");
  const finCompanies = order.filter((id) => fin.some((f) => f.owner_company_id === id));
  const others = (files ?? []).filter((f) => f.category !== "corp_financials");
  const sales = await Promise.all(companyIds.map(async (id) => ({ id, name: companyName.get(id) ?? "", ...(await monthlySales(id)) })));
  if (companyIds.length) await logPartner({ partnerId: me.partnerId, userId: me.id, action: "view_sales", target: companyIds.map((id) => companyName.get(id)).join("・") });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-500">{me.partnerName}</p>
          <h1 className="truncate text-xl font-bold text-slate-900">{me.name} 様</h1>
        </div>
        <form action={partnerLogout}>
          <button className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600">ログアウト</button>
        </form>
      </div>

      {/* 決算書 */}
      <section>
        <h2 className="mb-2 text-lg font-bold text-slate-900">決算書</h2>
        {!fin.length && <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400">まだありません</p>}
        <div className="space-y-4">
          {finCompanies.map((cid) => (
            <div key={cid}>
              <p className="mb-1.5 text-sm font-bold text-slate-600">{short(companyName.get(cid))}</p>
              <ul className="space-y-2">
                {fin
                  .filter((f) => f.owner_company_id === cid)
                  .map((f) => (
                    <DocCard
                      key={f.id}
                      f={f}
                      title={f.doc_date ? `${f.doc_date.slice(0, 4)}年${Number(f.doc_date.slice(5, 7))}月期 決算書` : "決算書"}
                      sub={`${f.doc_date ? `決算期末 ${ymd(f.doc_date)}・` : ""}${formatBytes(f.size_bytes)}`}
                    />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* そのほかの書類 */}
      {others.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold text-slate-900">そのほかの書類</h2>
          <ul className="space-y-2">
            {others.map((f) => (
              <DocCard
                key={f.id}
                f={f}
                title={f.doc_kind ?? VAULT_CATEGORIES[f.category as keyof typeof VAULT_CATEGORIES]?.label ?? "書類"}
                sub={[short(companyName.get(f.owner_company_id ?? "")), f.doc_date ? ymd(f.doc_date) : "", formatBytes(f.size_bytes)].filter(Boolean).join("・")}
              />
            ))}
          </ul>
        </section>
      )}

      {/* 月ごとの売上 */}
      {sales.map((c) => (
        <section key={c.id}>
          <h2 className="text-lg font-bold text-slate-900">{short(c.name)} 月ごとの売上</h2>
          <p className="mb-2 text-xs text-slate-500">税込・各店のレジ・予約システムの記録から集計（今月は昨日まで）</p>
          {!c.rows.length ? (
            <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400">まだデータがありません</p>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              {c.rows.map((r, i) => (
                <li key={r.month} className={i ? "border-t border-slate-100" : ""}>
                  <details>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-slate-600">{month(r.month)}</span>
                      <span className="text-right">
                        <span className="block font-bold tabular-nums text-slate-900">{man(r.total.sales)}</span>
                        <span className="block text-xs tabular-nums text-slate-400">客数 {r.total.people.toLocaleString()}人</span>
                      </span>
                    </summary>
                    {c.stores.length > 1 && (
                      <ul className="space-y-1 bg-slate-50 px-4 py-2 text-sm">
                        {c.stores.map((s) =>
                          r.byStore[s.id] ? (
                            <li key={s.id} className="flex justify-between gap-3">
                              <span className="truncate text-slate-600">{s.name}</span>
                              <span className="shrink-0 tabular-nums text-slate-800">
                                {yen(r.byStore[s.id].sales)}
                                <span className="ml-2 text-xs text-slate-400">{r.byStore[s.id].people.toLocaleString()}人</span>
                              </span>
                            </li>
                          ) : null,
                        )}
                      </ul>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          )}
          {c.stores.length > 1 && c.rows.length > 0 && <p className="mt-1 text-xs text-slate-400">月を押すと、店ごとの内訳が出ます</p>}
        </section>
      ))}

      {/* お預かり */}
      <section>
        <h2 className="mb-1 text-lg font-bold text-slate-900">書類をお送りいただく</h2>
        <p className="mb-2 text-sm text-slate-500">契約書・返済予定表などを、こちらからお送りいただけます</p>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <BankUploader />
          {(mine ?? []).length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
              {(mine ?? []).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3">
                  <a href={`/exchange/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 truncate text-brand">
                    {f.name}
                  </a>
                  <span className="shrink-0 text-xs text-slate-400">{new Date(f.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
