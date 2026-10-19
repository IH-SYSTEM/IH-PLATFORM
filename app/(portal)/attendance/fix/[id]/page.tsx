import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { findAttendance } from "@/lib/attendance-write";
import { toJSTTimeLabel } from "@/lib/business-day";
import { reportType } from "@/lib/reports/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { cannotReviewFix } from "@/lib/attendance-fix";
import { approveFix, rejectFix } from "../actions";
import { FixButtons } from "./fix-buttons";

export const metadata = { title: "打刻の修正依頼" };

const STATUS: Record<string, string> = { pending: "承認待ち", approved: "承認済み（反映しました）", rejected: "却下" };

/** LINE のリンクから開く、打刻の修正依頼の承認画面（その店のシフト管理者・店長・本部） */
export default async function FixReviewPage({ params }: PageProps<"/attendance/fix/[id]">) {
  const me = await requireStaff();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: r } = await admin.from("reports").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const denied = await cannotReviewFix(me, r);
  const type = reportType(r.type);
  const staffId = r.subject_staff_id ?? r.reporter_id;
  const p = r.payload as Record<string, string | number>;
  const [{ data: people }, { data: store }, current] = await Promise.all([
    admin.from("staff").select("id, name").in("id", [staffId, r.reporter_id]),
    admin.from("stores").select("name").eq("id", r.store_id).maybeSingle(),
    findAttendance(admin, staffId, String(p.date)),
  ]);
  const name = (sid: string) => people?.find((x) => x.id === sid)?.name ?? "—";
  const date = String(p.date);
  const row = (label: string, now: string, next: string | null) => (
    <tr>
      <td className="py-1.5 text-slate-500">{label}</td>
      <td className="py-1.5 text-right tabular-nums text-slate-600">{now}</td>
      <td className="py-1.5 text-center text-slate-300">→</td>
      <td className={`py-1.5 text-right font-bold tabular-nums ${next ? "text-brand" : "text-slate-400"}`}>{next ?? "そのまま"}</td>
    </tr>
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold text-slate-900">打刻の修正依頼</h1>
      <section className="space-y-2 rounded-md border border-slate-200 bg-white p-4 text-sm">
        <p className="text-lg font-bold text-slate-900">{name(staffId)}さん</p>
        <p className="text-slate-600">
          {store?.name}・{Number(date.slice(5, 7))}月{Number(date.slice(8, 10))}日
        </p>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-slate-400">
              <th />
              <th className="text-right font-normal">今の記録</th>
              <th />
              <th className="text-right font-normal">直したあと</th>
            </tr>
          </thead>
          <tbody>
            {row("出勤", current?.checkin_time ? toJSTTimeLabel(current.checkin_time, date) : "なし", p.checkin ? String(p.checkin) : null)}
            {row("退勤", current?.checkout_time ? toJSTTimeLabel(current.checkout_time, date) : "なし", p.checkout ? String(p.checkout) : null)}
            {row("休憩", current ? `${current.break_minutes}分` : "—", p.break && p.break !== "変えない" ? String(p.break) : null)}
          </tbody>
        </table>
        <p className="text-slate-700">理由：{String(p.reason)}{p.note ? `／${p.note}` : ""}</p>
        <p className="text-xs text-slate-400">
          {type?.title}・依頼：{name(r.reporter_id)}さん
        </p>
      </section>
      {r.status !== "pending" ? (
        <p className="rounded-md bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
          {STATUS[r.status] ?? r.status}
          {r.review_note ? `（${r.review_note}）` : ""}
        </p>
      ) : denied ? (
        <p className="rounded-md bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">{denied}</p>
      ) : (
        <FixButtons approve={approveFix.bind(null, id)} reject={rejectFix.bind(null, id)} />
      )}
      <Link href="/attendance" className="block text-center text-sm text-slate-500 underline">
        勤怠の画面へ
      </Link>
    </div>
  );
}
