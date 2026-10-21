import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { isBusyDay, isStoreClosed, offLimitFor, openMonths, partTimeWeeks, periodTypeFor, weekOfMonthLabel } from "@/lib/shift-period";
import { hm } from "@/lib/shifts";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveDefaultTime, submitOffRequests, submitPartTimeRequests } from "./actions";
import { OffRequestForm } from "./off-form";
import { PartTimeForm } from "./parttime-form";
import { DefaultTime } from "./default-time";
import { redirect } from "next/navigation";

export const metadata = { title: "シフト希望" };

const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const dow = (ymd: string) => "日月火水木金土"[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

export default async function ShiftRequestPage({ searchParams }: PageProps<"/shifts/request">) {
  const me = await requireStaff();
  const { p } = await searchParams;
  const admin = createAdminClient();
  const { data: dbSelf } = await admin.from("staff").select("role, store_id, shift_default_start, shift_default_end, busy_off_allowed").eq("id", me.id).single();
  const self = me.viewAs && dbSelf ? { ...dbSelf, role: me.role, store_id: me.viewStoreId ?? dbSelf.store_id } : dbSelf;
  const type = periodTypeFor(self?.role);
  // シフト希望を出さない雇用区分（役員・業務委託・管理部）はメニューにも出さず、開いてもスケジュールへ
  if (!type) redirect("/shifts/mine");
  const today = businessDayJST();

  const periods = type === "month" ? openMonths(today) : type === "week" ? partTimeWeeks(today) : [];
  // 「いつもの時間」：本人の設定 → 所属店舗の営業時間 → 19:00〜24:00 の順
  const { data: myStore } = self?.store_id
    ? await admin.from("stores").select("open_time, close_time, closed_weekdays, closed_dates, requested_off_limit, monthly_holidays, busy_weekdays, busy_dates").eq("id", self.store_id).maybeSingle()
    : { data: null };
  // 1人だけの部署（シフトの対象が自分だけ）は、希望を出さずに自分でシフトを入れて確定する（2026-10-19）
  const { data: mates } = self?.store_id ? await admin.from("staff").select("role").eq("store_id", self.store_id).eq("retired", false) : { data: [] };
  const solo = (mates ?? []).filter((m) => periodTypeFor(m.role)).length <= 1;
  if (solo)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">シフト希望</h1>
        <p className="rounded-md border border-line bg-white p-5 text-sm leading-relaxed text-slate-700">
          あなたの部署はシフトの対象があなた1人なので、希望は出さずに、ご自身でシフトを入れて確定してください。
          {type === "month" ? "前の月の25日まで" : "前の週の水曜日まで"}に確定すると、スケジュールに出ます。
        </p>
        <Link href="/shifts" className="block rounded-lg bg-brand py-3 text-center font-bold text-white">
          シフト確定の画面へ
        </Link>
      </div>
    );
  const defaults = {
    start: hm(self?.shift_default_start) || myStore?.open_time || "19:00",
    end: hm(self?.shift_default_end) || myStore?.close_time || "00:00",
  };
  const period = periods.find((x) => x.start === p) ?? periods[0];
  const [{ data: existing }, { data: submitted }] = period
    ? await Promise.all([
        admin.from("shift_requests").select("work_date, availability, preferred_start, preferred_end, source, note, firmness").eq("staff_id", me.id).in("work_date", period.days),
        admin.from("shift_request_submissions").select("submitted_at").eq("staff_id", me.id).eq("period_type", period.type).eq("period_start", period.start).maybeSingle(),
      ])
    : [{ data: [] }, { data: null }];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">シフト希望</h1>

      <section className="space-y-3">
        <div>
          <p className="text-xs text-slate-500">
            {type === "month"
              ? `社員は1か月ごとに、休みの希望を出します（前の月の20日まで。3か月先まで出せます）。${myStore?.monthly_holidays ? `月の休みは${myStore.monthly_holidays}日で、` : ""}店休日は自動で休み、残りを希望休として選べます（店休日が多い月は希望休が減ります）。それより多く休むときは有給で申請します`
              : type === "week"
                ? "週を選んで、入れる日と時間を入れてください（4週先まで）"
                : "あなたの雇用区分はシフト希望の対象外です"}
          </p>
        </div>
        {period && type === "week" && (
          // 週の一覧：第◯週・日付・提出期限（日曜）・確定日（水曜）。押すとその週の入力に切り替わる
          <ul className="space-y-2">
            {periods.map((x) => {
              const active = x.start === period.start;
              const late = today > x.submit;
              return (
                <li key={x.start}>
                  <Link href={`/shifts/request?p=${x.start}`} className={`block rounded-lg border px-4 py-3 ${active ? "border-brand bg-brand-soft" : "border-slate-200 bg-white"}`}>
                    <p className="flex flex-wrap items-baseline gap-x-3">
                      <span className={`font-bold ${active ? "text-brand" : "text-slate-900"}`}>{weekOfMonthLabel(x.start)}</span>
                      <span className="tabular-nums text-slate-700">{x.label}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      シフト希望提出期限：
                      <span className={`font-bold tabular-nums ${late ? "text-slate-400 line-through" : "text-accent"}`}>
                        {md(x.submit)}（{dow(x.submit)}曜日）
                      </span>
                      <span className="ml-3">
                        シフト確定日：<span className="font-bold tabular-nums">{md(x.decide)}（{dow(x.decide)}曜日）</span>
                      </span>
                    </p>
                    {late && <p className="mt-0.5 text-xs text-amber-700">提出期限を過ぎています。今から出すと、店長の確認待ちになります</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {period && (
          <>
            {type === "month" && (
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
            )}
            <p className="text-sm text-slate-600">
              {type === "week" ? (
                <span className="font-bold text-slate-800">
                  {weekOfMonthLabel(period.start)}（{period.label}）の希望
                </span>
              ) : (
                <>
                  提出期限：<span className="font-bold text-accent">{md(period.submit)}（{dow(period.submit)}）</span>
                </>
              )}
              {submitted ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">提出済み（変更できます）</span> : <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">未提出</span>}
            </p>
            {type === "week" ? (
              <>
                <DefaultTime start={defaults.start} end={defaults.end} action={saveDefaultTime} />
                <PartTimeForm
                  key={`${period.start}:${defaults.start}:${defaults.end}`}
                  days={period.days.map((d) => ({ date: d, label: `${md(d)}（${dow(d)}）`, weekend: ["土", "日"].includes(dow(d)) }))}
                  initial={Object.fromEntries(
                    (existing ?? [])
                      .filter((r) => r.availability !== "off")
                      .map((r) => [r.work_date, { s: hm(r.preferred_start) || defaults.start, e: hm(r.preferred_end) || defaults.end, urgent: r.source === "urgent" }]),
                  )}
                  defaults={defaults}
                  action={submitPartTimeRequests.bind(null, period.start)}
                />
              </>
            ) : (
              <OffRequestForm
                key={period.start}
                days={period.days.map((d) => ({
                  date: d,
                  label: `${md(d)}（${dow(d)}）`,
                  weekend: ["土", "日"].includes(dow(d)),
                  closed: isStoreClosed(d, myStore?.closed_weekdays ?? [], myStore?.closed_dates ?? []),
                  busy: isBusyDay(d, myStore?.busy_weekdays ?? [], myStore?.busy_dates ?? []),
                }))}
                initial={Object.fromEntries(
                  (existing ?? []).filter((r) => r.availability === "off" && r.note !== "店休日").map((r) => [r.work_date, r.firmness === "fixed" ? "fixed" : "flexible"] as const),
                )}
                busyAllowed={!!self?.busy_off_allowed}
                limit={myStore ? offLimitFor(period.days, myStore) : null}
                action={submitOffRequests.bind(null, period.start)}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
