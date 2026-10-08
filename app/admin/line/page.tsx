import { lineQuota } from "@/lib/line-push";
import { ROLE_LABELS } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";
import { Compose } from "./compose";

export const metadata = { title: "LINE配信" };

const KIND: Record<string, string> = { manual: "手動の配信", announcement: "お知らせ", labor_report: "人件費の報告", urgent: "急募", report: "報告の承認", other: "その他" };
const STATUS: Record<string, string> = { sent: "送信済み", partial: "一部失敗", failed: "失敗", skipped: "未送信（トークン未設定）" };
const when = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// IKKOU HOLDINGS NEWS から、相手を選んで送る。自動の通知も含めて、送ったものはすべてここに残る
export default async function LinePage() {
  const admin = createAdminClient();
  const [{ data: companies }, { data: stores }, { data: log }, { data: staff }, quota] = await Promise.all([
    admin.from("companies").select("id, name").eq("is_active", true).order("sort_order"),
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("line_messages").select("id, kind, body, recipient_count, unlinked_count, sent_count, status, created_by, created_at").order("created_at", { ascending: false }).limit(50),
    admin.from("staff").select("id, name"),
    lineQuota(),
  ]);
  const nameOf = new Map((staff ?? []).map((s) => [s.id, s.name]));
  const roles = Object.entries(ROLE_LABELS).filter(([k]) => k !== "officer").map(([id, name]) => ({ id, name }));
  const remaining = quota?.limit != null ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="LINE配信"
        description="IKKOU HOLDINGS NEWS から、相手を選んで送ります"
        actions={
          <div className="rounded-md border border-line bg-white px-4 py-2 text-right text-xs">
            {quota ? (
              <>
                <p className="text-slate-500">今月の送信数</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">
                  {quota.used.toLocaleString()}
                  <span className="text-xs font-normal text-slate-500"> / {quota.limit ? `${quota.limit.toLocaleString()}通` : "上限なし"}</span>
                </p>
              </>
            ) : (
              <p className="font-bold text-accent">LINEのアクセストークンが未設定です</p>
            )}
          </div>
        }
      />
      <Compose companies={companies ?? []} stores={stores ?? []} roles={roles} remaining={remaining} />

      <section>
        <h2 className="mb-3 text-xs font-bold tracking-[0.2em] text-slate-400">送った記録（自動の通知を含む）</h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200 bg-white">
          {(log ?? []).map((m) => (
            <li key={m.id} className="px-4 py-3 text-sm">
              <p className="text-xs text-slate-500">
                <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">{KIND[m.kind] ?? m.kind}</span>
                {when(m.created_at)}
                <span className="ml-2">
                  {m.sent_count}/{m.recipient_count}人
                  {m.unlinked_count ? `（未連携 ${m.unlinked_count}人）` : ""}
                </span>
                <span className={`ml-2 font-bold ${m.status === "sent" ? "text-emerald-700" : "text-accent"}`}>{STATUS[m.status] ?? m.status}</span>
                {m.created_by && <span className="ml-2">{nameOf.get(m.created_by)}</span>}
              </p>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-slate-800">{m.body}</p>
            </li>
          ))}
          {!log?.length && <li className="px-4 py-6 text-center text-sm text-slate-400">まだありません</li>}
        </ul>
      </section>
    </div>
  );
}
