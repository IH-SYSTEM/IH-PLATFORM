import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { FinancialsForm, MaintenanceButton, PosApplyForm } from "./review-forms";

const md = (d: string | null) => (d ? `${d.slice(0, 4)}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "?");

/**
 * 利用データ保管庫のうち、データ（表）の側：確かめてほしいもの・カテゴリごとのデータ・整理のまとめ。
 * 書類の原本の一覧（会社ごと）は、この下に今までどおり
 */
export async function DataPanels() {
  const admin = createAdminClient();
  const [{ data: reviews }, { data: fin }, { data: stores }, { data: cats }, { data: sets }, { data: runs }, { data: companies }] = await Promise.all([
    admin.from("datasets").select("id, title, description, kind, review_reason, period_from, period_to, row_count").eq("status", "needs_review").order("created_at"),
    admin.from("financial_statements").select("*").eq("approved", false).order("period_end"),
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("data_categories").select("id, name, description").is("merged_into", null).order("name"),
    admin.from("datasets").select("id, category_id, title, kind, status, period_from, period_to, row_count, error").neq("kind", "document").order("period_to", { ascending: false, nullsFirst: false }),
    admin.from("data_maintenance_runs").select("run_at, summary, actions").order("run_at", { ascending: false }).limit(1),
    admin.from("companies").select("id, name"),
  ]);
  const cname = new Map((companies ?? []).map((c) => [c.id, c.name.replace("株式会社", "")]));
  const processing = (sets ?? []).filter((s) => s.status === "processing").length;
  const errors = (sets ?? []).filter((s) => s.status === "error");
  const last = runs?.[0];

  return (
    <div className="space-y-5">
      {processing > 0 && <p className="rounded-md bg-slate-50 px-4 py-2 text-sm text-slate-600">AI がデータを読んでいます：{processing}件（再読み込みで反映されます）</p>}

      {((reviews ?? []).length > 0 || (fin ?? []).length > 0) && (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <h2 className="font-bold text-amber-900">確かめてほしいもの（公式の数字に入れる前に）</h2>
          <ul className="mt-2 space-y-4">
            {(reviews ?? [])
              .filter((r) => r.kind === "pos_airregi")
              .map((r) => (
                <li key={r.id}>
                  <p className="font-bold text-slate-900">{r.title}</p>
                  <p className="text-xs text-slate-600">{r.description}</p>
                  <PosApplyForm datasetId={r.id} stores={stores ?? []} />
                </li>
              ))}
            {(fin ?? []).map((f) => (
              <li key={f.id}>
                <p className="font-bold text-slate-900">
                  決算の数字：{cname.get(f.company_id)} {f.fiscal_label ?? ""}（{md(f.period_end)} 期末）
                </p>
                <p className="text-xs text-slate-600">AI が決算書から読み取った数字です。決算書と見比べて、違うところは直してから「これでいい」を押してください</p>
                <FinancialsForm statementId={f.id} datasetId={f.dataset_id} values={f} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-800">データ（AI が表に起こしたもの）</h2>
          <MaintenanceButton />
        </div>
        {last && (
          <div className="mt-2 rounded bg-slate-50 p-3 text-xs text-slate-600">
            <p>
              整理のまとめ（{new Date(last.run_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}）：{last.summary}
            </p>
            {(last.actions as { detail: string }[]).length > 0 && (
              <ul className="mt-1 list-inside list-disc">
                {(last.actions as { detail: string }[]).map((a, i) => (
                  <li key={i}>{a.detail}</li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-slate-400">毎月1日の朝に自動で整理します（似たカテゴリをまとめる・重複を見つける・足りない月を見つける）</p>
          </div>
        )}
        {!(cats ?? []).length && <p className="mt-2 text-sm text-slate-400">まだありません。CSV や Excel を入れると、AI が中身を読んでカテゴリを作り、表として貯めます</p>}
        <div className="mt-3 space-y-3">
          {(cats ?? []).map((c) => {
            const mine = (sets ?? []).filter((s) => s.category_id === c.id && s.status !== "error");
            if (!mine.length) return null;
            return (
              <div key={c.id}>
                <p className="text-sm font-bold text-slate-800">
                  {c.name}
                  <span className="ml-2 text-xs font-normal text-slate-400">{c.description}</span>
                </p>
                <ul className="mt-1 divide-y divide-slate-100 text-sm">
                  {mine.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
                      <Link href={`/admin/vault/data/${s.id}`} className="min-w-0 flex-1 truncate text-brand hover:underline">
                        {s.title}
                      </Link>
                      <span className="text-xs tabular-nums text-slate-500">
                        {md(s.period_from)}〜{md(s.period_to)}・{s.row_count.toLocaleString()}行
                      </span>
                      {s.status === "needs_review" && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">確かめ待ち</span>}
                      {s.status === "processing" && <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-500">読んでいます</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {errors.length > 0 && (
          <div className="mt-3 text-xs text-accent">
            <p className="font-bold">読めなかったもの</p>
            <ul className="list-inside list-disc">
              {errors.map((e) => (
                <li key={e.id}>
                  {e.title}：{e.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
