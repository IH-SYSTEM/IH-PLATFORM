import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { addDays, isPaidLeaveRole, LEAVE_STATUS, leaveSummary, mdW, rangeText, todayJST, type LeaveStatus } from "@/lib/paid-leave";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";
import { CancelLeaveButton, LeaveRequestForm } from "./leave-forms";

export const metadata = { title: "有給休暇" };

const TONE: Record<LeaveStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-accent-soft/50 text-accent",
  cancelled: "bg-slate-100 text-slate-500",
};

/** 有給の残りと申請（正社員だけ） */
export default async function MyLeavePage() {
  const me = await requireStaff();
  const admin = createAdminClient();
  const { data: dbSelf } = await admin.from("staff").select("role").eq("id", me.id).single();
  const self = me.viewAs && dbSelf ? { ...dbSelf, role: me.role } : dbSelf;
  if (!isPaidLeaveRole(self?.role))
    return (
      <div className="space-y-4">
        <PageHeader title="有給休暇" />
        <p className="rounded-md border border-line bg-white p-6 text-sm text-slate-600">有給の申請はポータルでは正社員の方が対象です。ほかの方は店長に相談してください</p>
      </div>
    );
  const today = todayJST();
  const [sum, { data: reqs }] = await Promise.all([
    leaveSummary(me.id),
    admin.from("paid_leave_requests").select("id, start_date, end_date, days, reason, late, status, review_note, created_at").eq("staff_id", me.id).order("start_date", { ascending: false }).limit(30),
  ]);
  const ob = sum?.obligation;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="有給休暇" description="残りの日数と申請。承認されるとシフトに「有給」が入ります" />

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="bg-brand px-5 py-4 text-white">
          <p className="text-xs text-white/70">今日の残り</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {sum?.remaining ?? 0}
            <span className="ml-1 text-base">日</span>
          </p>
          {!!sum?.pendingDays && <p className="mt-1 text-xs text-white/80">申請中 {sum.pendingDays}日（承認されると残りから引かれます）</p>}
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          {sum?.grants.map((g) => (
            <div key={g.date} className="flex justify-between px-5 py-2.5">
              <dt className="text-slate-500">{mdW(g.date)} に付与</dt>
              <dd className="tabular-nums text-slate-800">
                残り {g.left}日 <span className="text-xs text-slate-400">（{mdW(addDays(g.expires, -1))}まで）</span>
              </dd>
            </div>
          ))}
          {sum?.nextGrant && (
            <div className="flex justify-between px-5 py-2.5">
              <dt className="text-slate-500">次の付与</dt>
              <dd className="tabular-nums text-slate-800">
                {mdW(sum.nextGrant.date)} に {sum.nextGrant.days}日
              </dd>
            </div>
          )}
          {ob && (
            <div className="flex justify-between px-5 py-2.5">
              <dt className="text-slate-500">今年の取得（年5日は必ず）</dt>
              <dd className={`font-bold tabular-nums ${ob.used >= ob.need ? "text-emerald-700" : "text-accent"}`}>
                {ob.used} / {ob.need}日 <span className="text-xs font-normal text-slate-400">（{mdW(ob.to)}まで）</span>
              </dd>
            </div>
          )}
          {!sum?.hireDate && !sum?.baseline && <p className="px-5 py-3 text-xs text-accent">入社日が登録されていないため、残りを数えられません。本部に伝えてください</p>}
        </dl>
      </section>

      <section className="space-y-3 rounded-md border border-line bg-white p-5">
        <h2 className="text-base font-bold text-slate-900">有給を申請する</h2>
        <p className="text-xs text-slate-500">申請の期限：1日 … 2週間前／連続2〜4日 … 1か月前／連続5日以上 … 2か月前。期限を過ぎた日は「期限外」と出て選べません</p>
        <LeaveRequestForm today={today} minDate={addDays(today, 1)} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">自分の申請</h2>
        {reqs?.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
            {reqs.map((r) => (
              <li key={r.id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900">{rangeText(r.start_date, r.end_date)}</span>
                  <span className="text-slate-500">{r.days}日</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TONE[r.status as LeaveStatus]}`}>{LEAVE_STATUS[r.status as LeaveStatus]}</span>
                  {r.late && <span className="text-xs text-accent">期限後</span>}
                  <span className="flex-1" />
                  {r.status === "pending" && <CancelLeaveButton id={r.id} />}
                </div>
                {r.reason && <p className="text-xs text-slate-500">{r.reason}</p>}
                {r.review_note && <p className="text-xs font-bold text-slate-600">店長から：{r.review_note}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-line bg-white p-6 text-center text-sm text-slate-400">まだ申請はありません</p>
        )}
      </section>

      <p className="text-center text-xs text-slate-500">
        有給の決まりは
        <Link href="/me/documents" className="mx-1 font-bold text-brand underline">
          書類 › 会社の規程
        </Link>
        の就業規則で確かめられます
      </p>
    </div>
  );
}
