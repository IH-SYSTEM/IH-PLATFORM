import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { attendanceScope } from "@/lib/attendance";
import { LEAVE_STATUS, rangeText, todayJST, type LeaveStatus } from "@/lib/paid-leave";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";

export const metadata = { title: "有給の承認" };

/** 担当の店の有給の申請（承認待ちと、これからの承認済み） */
export default async function LeaveReviewList() {
  const me = await requireStaff();
  const scope = await attendanceScope(me);
  if (!scope) redirect("/");
  const admin = createAdminClient();
  let q = admin
    .from("paid_leave_requests")
    .select("id, staff_id, store_id, start_date, end_date, days, late, status")
    .in("status", ["pending", "approved"])
    .gte("end_date", todayJST())
    .order("start_date");
  if (!scope.all) q = q.in("store_id", scope.storeIds);
  const { data: rows } = await q;
  const ids = [...new Set((rows ?? []).map((r) => r.staff_id))];
  const { data: people } = ids.length ? await admin.from("staff").select("id, name").in("id", ids) : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.name]));
  const pending = (rows ?? []).filter((r) => r.status === "pending");
  const approved = (rows ?? []).filter((r) => r.status === "approved");

  const list = (items: typeof pending) =>
    items.length ? (
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
        {items.map((r) => (
          <li key={r.id}>
            <Link href={`/leave/review/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm hover:bg-slate-50">
              <span className="font-bold text-slate-900">{nameOf.get(r.staff_id)}</span>
              <span className="text-slate-600">
                {rangeText(r.start_date, r.end_date)}・{r.days}日
              </span>
              {r.late && <span className="text-xs text-accent">期限後</span>}
              <span className="flex-1" />
              <span className="text-xs text-slate-400">{LEAVE_STATUS[r.status as LeaveStatus]} ›</span>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <p className="rounded-md border border-line bg-white p-5 text-center text-sm text-slate-400">ありません</p>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="有給の承認" description="申請が来ると LINE でもお知らせします。承認するとシフトに「有給」が入ります" />
      <section className="space-y-2">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">承認待ち</h2>
        {list(pending)}
      </section>
      <section className="space-y-2">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">これからの有給（承認済み）</h2>
        {list(approved)}
      </section>
    </div>
  );
}
