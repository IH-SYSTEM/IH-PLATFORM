import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { attendanceScope, inScope } from "@/lib/attendance";
import { hhmmJST, shiftOn } from "@/lib/punch-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewAttendance } from "../actions";
import { ReviewButtons } from "./review-buttons";

export const metadata = { title: "勤怠の承認" };

const STATUS: Record<string, string> = { pending: "承認待ち", approved: "承認済み", rejected: "却下" };

/** LINE のリンクから開く承認の画面（シフトなしの出勤／残業）。その店を見られる人（店長・本部）だけ */
export default async function ReviewPage({ params, searchParams }: PageProps<"/attendance/review/[id]">) {
  const me = await requireStaff();
  const { id } = await params;
  const { k } = await searchParams;
  const kind = k === "overtime" ? "overtime" : "noshift";
  const admin = createAdminClient();
  const { data: a } = await admin.from("attendance").select("*").eq("id", id).maybeSingle();
  if (!a) notFound();
  const scope = await attendanceScope(me);
  if (!scope || !inScope(scope, a.store_id)) return <p className="text-sm text-slate-600">この店の承認はできません</p>;
  const [{ data: who }, { data: store }, shift] = await Promise.all([
    admin.from("staff").select("name").eq("id", a.staff_id).single(),
    admin.from("stores").select("name").eq("id", a.store_id).single(),
    shiftOn(a.staff_id, a.date),
  ]);
  const status = kind === "noshift" ? a.noshift_status : a.overtime_status;
  const md = `${Number(a.date.slice(5, 7))}月${Number(a.date.slice(8, 10))}日`;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold text-slate-900">{kind === "noshift" ? "シフトなしの出勤" : "残業の確認"}</h1>
      <section className="space-y-1 rounded-md border border-slate-200 bg-white p-4 text-sm">
        <p className="text-lg font-bold text-slate-900">{who?.name}さん</p>
        <p className="text-slate-600">
          {store?.name}・{md}
        </p>
        <p className="text-slate-600">
          出勤 {a.checkin_time ? hhmmJST(Date.parse(a.checkin_time)) : "—"}／退勤 {a.checkout_time ? hhmmJST(Date.parse(a.checkout_time)) : "勤務中"}
        </p>
        <p className="text-slate-600">シフト：{shift ? `${shift.startText}〜${shift.endText}` : "なし"}</p>
        {kind === "overtime" && (
          <>
            <p className="pt-2 text-base font-bold text-slate-900">{a.overtime_minutes ?? 0}分の残業です。承認しますか？</p>
            <p className="text-slate-700">
              理由：{a.overtime_category}／{a.overtime_reason}
            </p>
            <p className="text-xs text-slate-500">承認すると、この残業が給与に入ります。却下すると、シフトの終わりまでで数えます</p>
          </>
        )}
        {kind === "noshift" && <p className="pt-2 text-xs text-slate-500">シフトがない日の出勤です。却下すると、この日の勤務は給与に入りません</p>}
      </section>
      {status === "pending" ? (
        <ReviewButtons approve={reviewAttendance.bind(null, id, kind, "approved")} reject={reviewAttendance.bind(null, id, kind, "rejected")} />
      ) : (
        <p className="rounded-md bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">{STATUS[status ?? ""] ?? "対象ではありません"}</p>
      )}
      <Link href="/attendance" className="block text-center text-sm text-slate-500 underline">
        勤怠の画面へ
      </Link>
    </div>
  );
}
