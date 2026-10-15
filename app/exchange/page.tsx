import { VAULT_CATEGORIES, formatBytes } from "@/lib/files";
import { logPartner, requirePartner } from "@/lib/partner-auth";
import { monthlySales, sharesOf } from "@/lib/partner-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { partnerLogout } from "./actions";
import { BankUploader } from "./bank-uploader";

export const metadata = { title: "資料" };

const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
const ymd = (d: string) =>
  `${d.slice(0, 4)}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 取引先（銀行）の画面：お渡しした書類・会社ごとの月の売上・書類のお預かり */
export default async function BankHome() {
  const me = await requirePartner();
  const admin = createAdminClient();
  const { fileIds, companyIds } = await sharesOf(me.partnerId);
  const [{ data: files }, { data: companies }, { data: mine }] =
    await Promise.all([
      fileIds.length
        ? admin
            .from("files")
            .select(
              "id, name, category, doc_kind, doc_date, size_bytes, owner_company_id",
            )
            .in("id", fileIds)
            .eq("status", "ready")
            .order("doc_date", { ascending: false, nullsFirst: false })
        : Promise.resolve({
            data: [] as {
              id: string;
              name: string;
              category: string;
              doc_kind: string | null;
              doc_date: string | null;
              size_bytes: number;
              owner_company_id: string | null;
            }[],
          }),
      admin.from("companies").select("id, name").order("sort_order"),
      admin
        .from("files")
        .select("id, name, created_at, size_bytes")
        .eq("owner_partner_id", me.partnerId)
        .eq("status", "ready")
        .order("created_at", { ascending: false }),
    ]);
  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]));
  // 決算書は別に並べる
  const fin = (files ?? []).filter((f) => f.category === "corp_financials");
  const others = (files ?? []).filter((f) => f.category !== "corp_financials");
  const sales = await Promise.all(
    companyIds.map(async (id) => ({
      id,
      name: companyName.get(id) ?? "",
      ...(await monthlySales(id)),
    })),
  );
  if (companyIds.length)
    await logPartner({
      partnerId: me.partnerId,
      userId: me.id,
      action: "view_sales",
      target: companyIds.map((id) => companyName.get(id)).join("・"),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-slate-500">{me.partnerName}</p>
          <h1 className="text-xl font-bold text-slate-900">{me.name} 様</h1>
        </div>
        <form action={partnerLogout}>
          <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600">
            ログアウト
          </button>
        </form>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">決算書</h2>
        {!fin.length && (
          <p className="mt-2 text-sm text-slate-400">まだありません</p>
        )}
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {fin.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
            >
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {companyName
                  .get(f.owner_company_id ?? "")
                  ?.replace("株式会社", "")}
              </span>
              <span className="font-bold text-slate-800">
                {f.doc_kind ??
                  VAULT_CATEGORIES[f.category as keyof typeof VAULT_CATEGORIES]
                    ?.label}
              </span>
              {f.doc_date && (
                <span className="tabular-nums text-slate-500">
                  {ymd(f.doc_date)}
                </span>
              )}
              <a
                href={`/exchange/files/${f.id}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-brand hover:underline"
              >
                {f.name}
              </a>
              <span className="text-xs text-slate-400">
                {formatBytes(f.size_bytes)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {others.length > 0 && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">そのほかの書類</h2>

          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {others.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                  {companyName
                    .get(f.owner_company_id ?? "")
                    ?.replace("株式会社", "")}
                </span>
                <span className="font-bold text-slate-800">
                  {f.doc_kind ??
                    VAULT_CATEGORIES[
                      f.category as keyof typeof VAULT_CATEGORIES
                    ]?.label}
                </span>
                {f.doc_date && (
                  <span className="tabular-nums text-slate-500">
                    {ymd(f.doc_date)}
                  </span>
                )}
                <a
                  href={`/exchange/files/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-brand hover:underline"
                >
                  {f.name}
                </a>
                <span className="text-xs text-slate-400">
                  {formatBytes(f.size_bytes)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sales.map((c) => (
        <section
          key={c.id}
          className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="font-bold text-slate-900">
            {c.name} 月ごとの売上（税込）・客数
          </h2>
          {!c.rows.length ? (
            <p className="mt-2 text-sm text-slate-400">
              まだデータがありません
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">月</th>
                    {c.stores.map((s) => (
                      <th
                        key={s.id}
                        className="px-3 py-2 text-right font-medium"
                      >
                        {s.name}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">合計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {c.rows.map((r) => (
                    <tr key={r.month}>
                      <td className="px-3 py-2">{`${r.month.slice(0, 4)}年${Number(r.month.slice(5))}月`}</td>
                      {c.stores.map((s) => (
                        <td key={s.id} className="px-3 py-2 text-right">
                          {r.byStore[s.id] ? (
                            <>
                              {yen(r.byStore[s.id].sales)}
                              <span className="block text-xs text-slate-400">
                                {r.byStore[s.id].people.toLocaleString()}人
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-bold">
                        {yen(r.total.sales)}
                        <span className="block text-xs font-normal text-slate-400">
                          {r.total.people.toLocaleString()}人
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-400">
                各店のレジ・予約システムの記録から集計しています。今月は昨日までの分です
              </p>
            </div>
          )}
        </section>
      ))}

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">書類をお預かりする</h2>
        <p className="mt-1 text-sm text-slate-500">
          契約書・返済予定表などを、こちらからお送りいただけます
        </p>
        <div className="mt-3">
          <BankUploader />
        </div>
        {(mine ?? []).length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
            {(mine ?? []).map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-3 py-2"
              >
                <a
                  href={`/exchange/files/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-brand hover:underline"
                >
                  {f.name}
                </a>
                <span className="text-xs text-slate-400">
                  {formatBytes(f.size_bytes)}・
                  {new Date(f.created_at).toLocaleDateString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}{" "}
                  お預かり
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
