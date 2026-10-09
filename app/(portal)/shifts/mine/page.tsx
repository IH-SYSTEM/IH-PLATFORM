import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { mondayOf } from "@/lib/shift-period";
import { hm, SHIFT_TYPES, visibleShifts } from "@/lib/shifts";
import { createAdminClient } from "@/lib/supabase/admin";
import { MyShiftTabs } from "../my-tabs";

export const metadata = { title: "確定スケジュール" };

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const shiftMonth = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const minutes = (s: string | null, e: string | null) => {
  if (!s || !e) return 0;
  const a = Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  let b = Number(e.slice(0, 2)) * 60 + Number(e.slice(3, 5));
  if (b <= a) b += 1440;
  return b - a;
};

// 自分の確定したシフトを、月のカレンダーで見る（店長が週・月を確定したものだけ）
export default async function MyShiftsPage({ searchParams }: PageProps<"/shifts/mine">) {
  const me = await requireStaff();
  const today = businessDayJST();
  const { m } = await searchParams;
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : today.slice(0, 7);
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const calStart = mondayOf(first);
  const calEnd = addDays(mondayOf(last), 6);

  const admin = createAdminClient();
  const { data: self } = await admin.from("staff").select("role").eq("id", me.id).single();
  const shifts = await visibleShifts(me.id, self?.role ?? null, calStart, calEnd);
  const { data: stores } = shifts.length ? await admin.from("stores").select("id, name").in("id", [...new Set(shifts.map((s) => s.store_id))]) : { data: [] };
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const byDate = new Map(shifts.map((s) => [s.work_date, s]));
  const inMonth = shifts.filter((s) => s.work_date >= first && s.work_date <= last && s.shift_type === "work");
  const total = inMonth.reduce((a, s) => a + minutes(s.planned_start, s.planned_end), 0);
  const weeks: string[][] = [];
  for (let mon = calStart; mon <= calEnd; mon = addDays(mon, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(mon, i)));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">シフト</h1>
      <MyShiftTabs active="mine" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={`?m=${shiftMonth(month, -1)}`} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            ‹ 前の月
          </Link>
          <span className="px-2 text-sm font-bold text-slate-800">
            {month.slice(0, 4)}年{Number(month.slice(5))}月
          </span>
          <Link href={`?m=${shiftMonth(month, 1)}`} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            次の月 ›
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          出勤 <b className="tabular-nums">{inMonth.length}</b>日・予定 <b className="tabular-nums">{Math.floor(total / 60)}</b>時間{total % 60 ? `${total % 60}分` : ""}
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-white">
        <div className="grid grid-cols-7 bg-slate-50 text-center text-xs font-medium text-slate-500">
          {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
            <div key={d} className={`py-2 ${d === "土" ? "text-brand" : d === "日" ? "text-accent" : ""}`}>
              {d}
            </div>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w[0]} className="grid grid-cols-7 border-t border-slate-100">
            {w.map((d) => {
              const s = byDate.get(d);
              const outside = d.slice(0, 7) !== month;
              const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
              return (
                <div key={d} className={`min-h-[72px] border-l border-slate-100 p-1 first:border-l-0 sm:p-1.5 ${outside ? "bg-slate-50/60 opacity-50" : ""} ${d === today ? "ring-2 ring-inset ring-accent" : ""}`}>
                  <p className={`text-[11px] font-bold ${dow === 0 ? "text-accent" : dow === 6 ? "text-brand" : "text-slate-600"}`}>{Number(d.slice(8, 10))}</p>
                  {s &&
                    (s.shift_type === "work" ? (
                      <div className="mt-0.5 rounded bg-brand-soft px-1 py-0.5 text-[10px] leading-tight text-brand sm:text-[11px]">
                        <p className="font-bold tabular-nums">{hm(s.planned_start)}</p>
                        <p className="tabular-nums">〜{hm(s.planned_end)}</p>
                        {s.work_role && <p className="truncate font-bold">{s.work_role}</p>}
                        {storeName.size > 1 && <p className="truncate text-slate-500">{storeName.get(s.store_id)}</p>}
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-slate-500">{SHIFT_TYPES.find((t) => t.key === s.shift_type)?.label}</p>
                    ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">アルバイトは店長が承認したシフトがすぐ表示されます。社員は店長が月を確定したあとに表示されます。希望を出すのは「シフト希望」から。</p>
    </div>
  );
}
