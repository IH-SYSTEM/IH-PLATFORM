import { requireStaff } from "@/lib/auth";
import { reportType } from "@/lib/reports/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { Toast } from "@/app/toast";
import { PageHeader } from "@/app/shell/page-header";
import { StatusBadge } from "./status-badge";
import { ReportCatalog } from "./report-catalog";

export const metadata = { title: "報告窓口" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });


export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const me = await requireStaff();
  const { sent } = await searchParams;
  const admin = createAdminClient();
  const { data: mine } = await admin
    .from("reports")
    .select("id, type, payload, status, review_note, created_at, reporter_id, subject_staff_id")
    .or(`reporter_id.eq.${me.id},subject_staff_id.eq.${me.id}`)
    .order("created_at", { ascending: false })
    .limit(20);
  const ids = [...new Set((mine ?? []).flatMap((r) => [r.reporter_id, r.subject_staff_id]).filter(Boolean))];
  const { data: people } = ids.length ? await admin.from("staff").select("id, name").in("id", ids) : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="space-y-8">
      <PageHeader title="報告窓口" description="困ったこと・届け・トラブルは、すべてここから本部に送ります。本部が確認し、結果をLINEでお知らせします" />

      <ReportCatalog />

      <section>
        <h2 className="mb-3 text-xs font-bold tracking-[0.2em] text-slate-400">自分に関係する報告</h2>
        {mine && mine.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
            {mine.map((r) => {
              const t = reportType(r.type);
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-slate-800">{t?.title ?? r.type}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{t?.summary(r.payload, { subject: nameOf.get(r.subject_staff_id) }) ?? ""}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {when(r.created_at)} 報告者：{r.reporter_id === me.id ? "自分" : nameOf.get(r.reporter_id)}
                  </p>
                  {r.status === "rejected" && r.review_note && <p className="mt-1 text-xs font-bold text-accent">却下の理由：{r.review_note}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-md border border-line bg-white p-6 text-center text-sm text-slate-400">まだ報告はありません</p>
        )}
      </section>

      {sent === "1" && <Toast message="本部に報告しました" />}
    </div>
  );
}
