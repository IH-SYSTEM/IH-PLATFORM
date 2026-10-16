import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { attendanceScope, inScope } from "@/lib/attendance";
import { LEAVE_STATUS, leaveSummary, mdW, rangeText, requestDeadline, spanDays, type LeaveStatus } from "@/lib/paid-leave";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewLeave } from "../actions";
import { LeaveReviewButtons } from "./leave-review-buttons";

export const metadata = { title: "有給の承認" };

/** LINE のリンクから開く有給の承認の画面。その店を見られる人（店長・本部）だけ */
export default async function LeaveReviewPage({ params }: PageProps<"/leave/review/[id]">) {
  const me = await requireStaff();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: r } = await admin.from("paid_leave_requests").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const scope = await attendanceScope(me);
  if (!scope || !inScope(scope, r.store_id)) return <p className="text-sm text-slate-600">この店の承認はできません</p>;
  const [{ data: who }, { data: store }, sum] = await Promise.all([
    admin.from("staff").select("name").eq("id", r.staff_id).single(),
    admin.from("stores").select("name").eq("id", r.store_id).maybeSingle(),
    leaveSummary(r.staff_id),
  ]);
  const due = requestDeadline(r.start_date, spanDays(r.start_date, r.end_date));

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold text-slate-900">有給の承認</h1>
      <section className="space-y-1 rounded-md border border-slate-200 bg-white p-4 text-sm">
        <p className="text-lg font-bold text-slate-900">{who?.name}さん</p>
        <p className="text-slate-600">{store?.name}</p>
        <p className="pt-2 text-base font-bold text-slate-900">
          {rangeText(r.start_date, r.end_date)}（{r.days}日）
        </p>
        {r.reason && <p className="text-slate-700">理由：{r.reason}</p>}
        <p className="text-slate-600">
          申請：{mdW(r.created_at.slice(0, 10))}／期限：{mdW(due)}
          {r.late && <span className="ml-1 font-bold text-accent">期限を過ぎた申請です</span>}
        </p>
        <p className="text-slate-600">
          残りの有給：{sum?.remaining ?? 0}日{sum?.obligation ? `／今年の取得 ${sum.obligation.used}/5日` : ""}
        </p>
        <p className="pt-1 text-xs text-slate-500">承認すると、この期間のシフトに「有給」が入ります（公休の日はそのまま）</p>
      </section>
      {r.status === "pending" ? (
        <LeaveReviewButtons approve={reviewLeave.bind(null, id, "approved")} reject={reviewLeave.bind(null, id, "rejected")} />
      ) : (
        <p className="rounded-md bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">{LEAVE_STATUS[r.status as LeaveStatus]}</p>
      )}
      <Link href="/leave/review" className="block text-center text-sm text-slate-500 underline">
        有給の申請の一覧へ
      </Link>
    </div>
  );
}
