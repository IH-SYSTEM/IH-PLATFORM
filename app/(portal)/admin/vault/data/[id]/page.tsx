import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { canUseVault } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "データ" };

type Col = { key: string; label: string; type: string; unit?: string };

/** 1つのデータ（AI が表に起こしたもの）：説明・列・月ごとの合計・中身（最初の300行） */
export default async function DatasetPage({ params }: PageProps<"/admin/vault/data/[id]">) {
  const me = await requireAdmin();
  if (!canUseVault(me)) return <p className="text-sm text-slate-600">利用データ保管庫は、経理・総務の担当だけが見られます</p>;
  const { id } = await params;
  const admin = createAdminClient();
  const { data: ds } = await admin.from("datasets").select("*, data_categories(name), files(id, name)").eq("id", id).maybeSingle();
  if (!ds) notFound();
  const { data: rows } = await admin.from("dataset_rows").select("data").eq("dataset_id", id).order("row_index").limit(300);
  const cols = (ds.schema ?? []) as Col[];
  const monthly = (ds.stats as { monthly?: Record<string, Record<string, number>> } | null)?.monthly;
  const fmt = (v: unknown, c: Col) => (typeof v === "number" ? (c.type === "money" ? `${v.toLocaleString()}円` : v.toLocaleString()) : String(v ?? ""));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <Link href="/admin/vault" className="text-sm text-slate-500 hover:text-slate-800">
          ← データ保管庫
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{ds.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          カテゴリ：{(ds.data_categories as { name: string } | null)?.name ?? "—"}・{ds.row_count.toLocaleString()}行・{ds.period_from ?? "?"}〜{ds.period_to ?? "?"}
          {ds.files && (
            <a href={`/files/${(ds.files as { id: string }).id}`} target="_blank" rel="noreferrer" className="ml-3 text-brand hover:underline">
              元のファイル
            </a>
          )}
        </p>
        {ds.description && <p className="mt-3 whitespace-pre-wrap rounded-md bg-brand-soft p-3 text-sm text-slate-700">{ds.description}</p>}
      </div>

      {monthly && (
        <section className="overflow-x-auto rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800">月ごとの合計</h2>
          <table className="mt-2 w-full text-sm tabular-nums">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">月</th>
                {Object.keys(Object.values(monthly)[0] ?? {}).map((k) => (
                  <th key={k} className="px-3 py-1.5 text-right font-medium">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(monthly)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([m, v]) => (
                  <tr key={m}>
                    <td className="px-3 py-1.5">{m}</td>
                    {Object.keys(Object.values(monthly)[0] ?? {}).map((k) => (
                      <td key={k} className="px-3 py-1.5 text-right">
                        {Math.round(v[k] ?? 0).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="overflow-x-auto rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">中身{ds.row_count > 300 ? `（最初の300行／全${ds.row_count.toLocaleString()}行）` : ""}</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-1.5 text-left font-medium">
                  {c.label}
                  {c.unit ? `（${c.unit}）` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-3 py-1.5 ${c.type === "money" || c.type === "number" ? "text-right tabular-nums" : ""}`}>
                    {fmt((r.data as Record<string, unknown>)[c.label], c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
