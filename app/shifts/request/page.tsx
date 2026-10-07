import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { openMonths, openWeeks, periodTypeFor } from "@/lib/shift-period";
import { hm, SHIFT_TYPES, visibleShifts } from "@/lib/shifts";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitRequests } from "./actions";
import { RequestForm } from "./request-form";

export const metadata = { title: "シフト希望" };

const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const dow = (ymd: string) => "日月火水木金土"[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

export default async function ShiftRequestPage({ searchParams }: PageProps<"/shifts/request">) {
  const me = await requireStaff();
  const { p } = await searchParams;
  const admin = createAdminClient();
  const { data: self } = await admin.from("staff").select("role").eq("id", me.id).single();
  const type = periodTypeFor(self?.role);
  const today = businessDayJST();

  const upcoming = await visibleShifts(me.id, self?.role ?? null, today, `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`);
  const { data: stores } = upcoming.length ? await admin.from("stores").select("id, name").in("id", [...new Set(upcoming.map((s) => s.store_id))]) : { data: [] };
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));

  const periods = type === "month" ? openMonths(today) : type === "week" ? openWeeks(today) : [];
  const period = periods.find((x) => x.start === p) ?? periods[0];
  const [{ data: existing }, { data: submitted }] = period
    ? await Promise.all([
        admin.from("shift_requests").select("work_date, availability, preferred_start, preferred_end").eq("staff_id", me.id).in("work_date", period.days),
        admin.from("shift_request_submissions").select("submitted_at").eq("staff_id", me.id).eq("period_type", period.type).eq("period_start", period.start).maybeSingle(),
      ])
    : [{ data: [] }, { data: null }];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/" className="inline-block text-sm text-slate-500 hover:text-brand">
        ← ポータル
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-bold text-brand">
        <span className="h-5 w-1 bg-accent" />
        シフト
      </h1>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">確定したシフト</h2>
        {upcoming.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white text-sm">
            {upcoming.slice(0, 14).map((s) => (
              <li key={s.work_date} className="flex items-center justify-between px-4 py-2.5">
                <span className="font-medium text-slate-800">
                  {md(s.work_date)}（{dow(s.work_date)}）
                </span>
                <span className="tabular-nums text-slate-700">
                  {s.shift_type === "work" ? `${hm(s.planned_start)}〜${hm(s.planned_end)}` : SHIFT_TYPES.find((t) => t.key === s.shift_type)?.label}
                  <span className="ml-2 text-xs text-slate-400">{storeName.get(s.store_id)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-line bg-white p-5 text-center text-sm text-slate-400">確定したシフトはまだありません</p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-700">シフト希望の提出</h2>
          <p className="text-xs text-slate-500">
            {type === "month"
              ? "社員は1か月ごとに、前月15日までに提出します"
              : type === "week"
                ? "アルバイトは1週間（月〜日）ごとに、前の週の日曜日までに提出します。4週先まで出せます"
                : "あなたの雇用区分はシフト希望の対象外です"}
          </p>
        </div>
        {period && (
          <>
            <div className="flex flex-wrap gap-2">
              {periods.map((x) => (
                <Link
                  key={x.start}
                  href={`/shifts/request?p=${x.start}`}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${x.start === period.start ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
                >
                  {x.label}
                </Link>
              ))}
            </div>
            <p className="text-sm text-slate-600">
              提出期限：<span className="font-bold text-accent">{md(period.submit)}（{dow(period.submit)}）</span>
              {submitted ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">提出済み（期限まで変更できます）</span> : <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">未提出</span>}
            </p>
            <RequestForm
              key={period.start}
              days={period.days.map((d) => ({ date: d, label: `${md(d)}（${dow(d)}）`, weekend: ["土", "日"].includes(dow(d)) }))}
              initial={Object.fromEntries((existing ?? []).map((r) => [r.work_date, { a: r.availability, s: hm(r.preferred_start), e: hm(r.preferred_end) }]))}
              action={submitRequests.bind(null, period.start)}
            />
          </>
        )}
      </section>
    </div>
  );
}
