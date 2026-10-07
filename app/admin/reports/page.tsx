import Link from "next/link";
import { reportType } from "@/lib/reports/registry";
import { CATEGORIES, type CategoryKey } from "@/lib/reports/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusBadge } from "@/app/reports/status-badge";
import { approveReport, rejectReport } from "./actions";
import { ReviewButtons } from "./review-buttons";

export const metadata = { title: "報告の受付" };

const TABS = [
  { key: "pending", label: "未処理" },
  { key: "approved", label: "承認済み" },
  { key: "rejected", label: "却下" },
] as const;

// 報告の内容の時刻と、報告した時刻がこれ以上離れていれば「事後報告」として目立たせる
const LATE_MS = 60 * 60 * 1000;

const when = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const { status: s, category: c } = await searchParams;
  const status = TABS.some((t) => t.key === s) ? (s as string) : "pending";
  const category = typeof c === "string" && c in CATEGORIES ? (c as CategoryKey) : null;

  const admin = createAdminClient();
  let q = admin
    .from("reports")
    .select("id, type, category, store_id, reporter_id, subject_staff_id, payload, on_site, distance_m, status, review_note, reviewed_by, reviewed_at, created_at")
    .eq("status", status)
    .order("created_at", { ascending: status === "pending" })
    .limit(200);
  if (category) q = q.eq("category", category);
  const [{ data: reports }, { count: pendingCount }] = await Promise.all([
    q,
    admin.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const staffIds = [...new Set((reports ?? []).flatMap((r) => [r.reporter_id, r.subject_staff_id, r.reviewed_by]).filter(Boolean))];
  const storeIds = [...new Set((reports ?? []).map((r) => r.store_id).filter(Boolean))];
  const [{ data: people }, { data: stores }] = await Promise.all([
    staffIds.length ? admin.from("staff").select("id, name").in("id", staffIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    storeIds.length ? admin.from("stores").select("id, name").in("id", storeIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.name]));
  const storeOf = new Map((stores ?? []).map((p) => [p.id, p.name]));
  const href = (next: { status?: string; category?: string | null }) => {
    const p = new URLSearchParams({ status: next.status ?? status });
    const cat = next.category === undefined ? category : next.category;
    if (cat) p.set("category", cat);
    return `/admin/reports?${p}`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">報告の受付</h1>
        <p className="mt-1 text-sm text-slate-500">
          現場からの報告を確認し、承認すると記録に自動で反映されます。給与の締めの前に、未処理を0件にしてください
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href({ status: t.key })}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${status === t.key ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {t.label}
            {t.key === "pending" && <span className="ml-1.5 tabular-nums">{pendingCount ?? 0}</span>}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <Link href={href({ category: null })} className={`text-sm ${!category ? "font-bold text-brand" : "text-slate-500"}`}>
          すべて
        </Link>
        {(Object.keys(CATEGORIES) as CategoryKey[]).map((k) => (
          <Link key={k} href={href({ category: k })} className={`text-sm ${category === k ? "font-bold text-brand" : "text-slate-500"}`}>
            {CATEGORIES[k].label}
          </Link>
        ))}
      </div>

      {(reports ?? []).length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {status === "pending" ? "未処理の報告はありません" : "該当する報告はありません"}
        </p>
      ) : (
        <ul className="space-y-3">
          {(reports ?? []).map((r) => {
            const t = reportType(r.type);
            const at = t?.reportedAt?.(r.payload);
            const late = at ? Math.abs(Date.parse(r.created_at) - Date.parse(at)) > LATE_MS : false;
            return (
              <li key={r.id} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-accent">
                      {CATEGORIES[r.category as CategoryKey]?.label ?? r.category}
                      <span className="ml-2 font-normal text-slate-400">{storeOf.get(r.store_id) ?? "店舗不明"}</span>
                    </p>
                    <p className="mt-0.5 font-bold text-slate-900">{t?.title ?? r.type}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-2 text-sm text-slate-800">{t?.summary(r.payload, { subject: nameOf.get(r.subject_staff_id) }) ?? JSON.stringify(r.payload)}</p>
                {r.payload.note && <p className="mt-1 text-sm text-slate-500">メモ：{String(r.payload.note)}</p>}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>報告者：{nameOf.get(r.reporter_id) ?? "—"}</span>
                  <span>報告日時：{when(r.created_at)}</span>
                  <span className={r.on_site ? "text-emerald-700" : "font-bold text-accent"}>
                    {r.on_site === null ? "位置未確認" : r.on_site ? `店舗内から報告（約${r.distance_m}m）` : `店舗外から報告（約${r.distance_m}m）`}
                  </span>
                  {late && <span className="font-bold text-amber-700">事後報告（報告日時と内容の時刻が1時間以上離れています）</span>}
                </div>
                {r.status === "pending" ? (
                  <ReviewButtons approve={approveReport.bind(null, r.id)} reject={rejectReport.bind(null, r.id)} />
                ) : (
                  <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    {r.status === "approved" ? "承認" : "却下"}：{nameOf.get(r.reviewed_by) ?? "—"}（{r.reviewed_at ? when(r.reviewed_at) : "—"}）
                    {r.review_note && <span className="ml-2">理由：{r.review_note}</span>}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
