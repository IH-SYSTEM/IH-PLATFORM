import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { hasDuty } from "@/lib/duties";
import { leaveSummaries, mdW, PAID_LEAVE_ROLES, todayJST } from "@/lib/paid-leave";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";
import { saveBaseline } from "./actions";
import { BaselineForm } from "./baseline-form";

export const metadata = { title: "有給の管理" };

/**
 * 正社員の有給の残りと「年5日」の取得状況（総務・経理の担当）。
 * 残りは入社日から法律どおり自動。今の残高が分かっている人は「はじめの残高」を入れると、その日から自動で足し引きする
 */
export default async function AdminLeavePage() {
  const me = await requireAdmin();
  if (!hasDuty(me, "soumu", "keiri_input", "keiri_approve")) redirect("/admin");
  const admin = createAdminClient();
  const { data: people } = await admin.from("staff").select("id, name, hire_date, store_id").in("role", PAID_LEAVE_ROLES).eq("retired", false).order("hire_date");
  const today = todayJST();
  const sums = await leaveSummaries((people ?? []).map((p) => p.id), today);
  const { data: stores } = await admin.from("stores").select("id, name");
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  // 年5日：義務の期間の残りが3か月を切っていて、まだ5日に届いていない人を先に
  const rows = (people ?? []).map((p) => ({ p, s: sums.get(p.id) })).sort((a, b) => {
    const risk = (x: typeof a) => (x.s?.obligation && x.s.obligation.used < 5 ? x.s.obligation.to : "9999");
    return risk(a).localeCompare(risk(b));
  });
  const behind = rows.filter((r) => r.s?.obligation && r.s.obligation.used < 5);

  return (
    <div className="space-y-6">
      <PageHeader title="有給の管理" description="正社員の有給の残りと、年5日の取得状況。残りは入社日から法律どおり自動で計算します" />

      {behind.length > 0 && (
        <section className="rounded-md border border-accent/30 bg-accent-soft/30 p-4 text-sm">
          <p className="font-bold text-accent">年5日にまだ届いていない人：{behind.length}人</p>
          <p className="mt-1 text-xs text-slate-600">期限までに5日取れていないと、会社が法律違反になります（1人30万円以下の罰金）。店長と相談して、日を決めて取ってもらってください</p>
        </section>
      )}

      <div className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">名前</th>
              <th className="px-3 py-2 text-left">入社日</th>
              <th className="px-3 py-2 text-right">残り</th>
              <th className="px-3 py-2 text-left">次の付与</th>
              <th className="px-3 py-2 text-left">年5日</th>
              <th className="px-3 py-2 text-left">はじめの残高</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ p, s }) => {
              const ob = s?.obligation;
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <p className="font-bold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-400">{storeName.get(p.store_id ?? "") ?? ""}</p>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{p.hire_date ?? <span className="text-xs font-bold text-accent">未登録</span>}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {s?.remaining ?? 0}日{!!s?.pendingDays && <span className="block text-xs font-normal text-slate-400">申請中 {s.pendingDays}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums text-slate-600">{s?.nextGrant ? `${mdW(s.nextGrant.date)} ${s.nextGrant.days}日` : "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">
                    {ob ? (
                      <span className={ob.used >= 5 ? "text-emerald-700" : "font-bold text-accent"}>
                        {ob.used}/5日（{mdW(ob.to)}まで）
                      </span>
                    ) : (
                      <span className="text-slate-400">対象前</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <BaselineForm action={saveBaseline.bind(null, p.id)} asOf={s?.baseline?.asOf ?? null} remaining={s?.baseline?.remaining ?? null} defaultDate={today} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        「はじめの残高」：これまで紙や前のシステムで数えていた人は、ある日の時点の残りを入れてください。その日より前は数えず、その日から付与と取得を自動で足し引きします。空にして保存すると、入社日からの自動計算に戻ります
      </p>
    </div>
  );
}
