import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { hm } from "@/lib/shifts";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondUrgent } from "../../urgent-actions";
import { UrgentResponse } from "./urgent-response";

export const metadata = { title: "急募" };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${"日月火水木金土"[new Date(`${d}T00:00:00Z`).getUTCDay()]}）`;

// 急募のLINEから開くページ。入れる時間を確かめて応募する
export default async function UrgentPage({ params }: PageProps<"/shifts/urgent/[id]">) {
  const me = await requireStaff();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: call } = await admin.from("urgent_calls").select("id, store_id, work_date, start_time, end_time, reason, note").eq("id", id).maybeSingle();
  const { data: store } = call ? await admin.from("stores").select("name").eq("id", call.store_id).single() : { data: null };
  const { data: mine } = call
    ? await admin.from("shift_requests").select("source, urgent_call_id").eq("staff_id", me.id).eq("work_date", call.work_date).maybeSingle()
    : { data: null };
  const closed = !call || call.work_date < businessDayJST();

  return (
    <div className="mx-auto max-w-md space-y-5">
      <Link href="/shifts/request" className="inline-block text-sm text-slate-500 hover:text-brand">
        ← シフト
      </Link>
      <section className="rounded-md border border-accent/40 bg-white p-5">
        <p className="text-xs font-bold tracking-widest text-accent">急募</p>
        {call ? (
          <>
            <h1 className="mt-1 text-xl font-bold text-brand">{store?.name}</h1>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
              {md(call.work_date)} {hm(call.start_time)}〜{hm(call.end_time)}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              理由：{call.reason}
              {call.note && `（${call.note}）`}
            </p>
            {closed ? (
              <p className="mt-4 text-sm font-bold text-slate-500">この急募は締め切られました</p>
            ) : mine?.urgent_call_id === call.id ? (
              <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm font-bold text-emerald-700">応募済みです。店長が確定すると、シフトに表示されます</p>
            ) : (
              <UrgentResponse start={hm(call.start_time)} end={hm(call.end_time)} action={respondUrgent.bind(null, call.id)} />
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">この急募は見つかりません</p>
        )}
      </section>
    </div>
  );
}
