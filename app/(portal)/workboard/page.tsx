import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { attendanceScope } from "@/lib/attendance";
import { businessDayJST } from "@/lib/business-day";
import { addDays, mondayOf, weekDays } from "@/lib/shift-period";
import { hm, SHIFT_TYPES } from "@/lib/shifts";
import { storeSchedule, type SchedulePerson, type ScheduleRow } from "@/lib/store-schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { axisRange, barPos, headcount, hourLabel, hourTicks, span } from "@/lib/timeline";
import { StoreSelect } from "./store-select";

export const metadata = { title: "ワークボード" };

type View = "day" | "week" | "month";
const VIEWS: [View, string][] = [
  ["day", "日"],
  ["week", "週"],
  ["month", "月"],
];
const DOW = "日月火水木金土";
const dowOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const dowColor = (d: string) => (dowOf(d) === 0 ? "text-accent" : dowOf(d) === 6 ? "text-brand" : "text-slate-600");
const shiftMonth = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const sortKey = (p: SchedulePerson) => p.furigana || p.name;

/**
 * ワークボード（2026-10-23 黒田さん）：店の確定したシフトを、何時に誰が入っているかで見る。
 *   日 … 1列目に人、2列目からが時間のタイムライン（1時間ごとの人数つき）
 *   週 … 1列目に人、2列目から7日分。日ごとに小さいタイムライン
 *   月 … カレンダー。日付を押すと、その日のタイムライン
 * 見られる店：店長・シフト管理者・本部は担当の店、ほかの人は自分の所属店
 */
export default async function WorkboardPage({ searchParams }: PageProps<"/workboard">) {
  const me = await requireStaff();
  const sp = await searchParams;
  const today = businessDayJST();
  const admin = createAdminClient();

  const scope = await attendanceScope(me);
  let storeIds: string[] | null = scope ? (scope.all ? null : scope.storeIds) : [];
  if (storeIds && !storeIds.length) {
    const { data: self } = await admin.from("staff").select("store_id").eq("id", me.id).single();
    storeIds = self?.store_id ? [self.store_id] : [];
    if (me.viewAs && me.viewStoreId) storeIds = [me.viewStoreId];
  }
  let q = admin.from("stores").select("id, name, open_time, close_time").eq("is_active", true).order("sort_order", { nullsFirst: false });
  if (storeIds) q = q.in("id", storeIds.length ? storeIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: stores } = await q;
  const store = (stores ?? []).find((s) => s.id === sp.store) ?? (stores ?? [])[0];
  if (!store) redirect("/");

  const view: View = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const date = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const link = (v: View, d: string) => `/workboard?${new URLSearchParams({ store: store.id, view: v, d })}`;

  // 見る期間と、前・次
  const month = date.slice(0, 7);
  const monday = mondayOf(date);
  const [from, to, prev, next, title] =
    view === "day"
      ? [date, date, addDays(date, -1), addDays(date, 1), `${Number(date.slice(0, 4))}年${md(date)}（${DOW[dowOf(date)]}）`]
      : view === "week"
        ? [monday, addDays(monday, 6), addDays(monday, -7), addDays(monday, 7), `${md(monday)}〜${md(addDays(monday, 6))}`]
        : [
            mondayOf(`${month}-01`),
            addDays(mondayOf(addDays(`${shiftMonth(month, 1)}-01`, -1)), 6),
            `${shiftMonth(month, -1)}-01`,
            `${shiftMonth(month, 1)}-01`,
            `${month.slice(0, 4)}年${Number(month.slice(5))}月`,
          ];

  const { shifts, people } = await storeSchedule(store.id, from, to);
  const work = shifts.filter((s) => s.shift_type === "work");
  const spans = work.map((s) => span(s.planned_start, s.planned_end)).filter((x): x is [number, number] => !!x);
  const axis = axisRange(store.open_time, store.close_time, spans);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">ワークボード</h1>
          <p className="mt-1 text-sm text-slate-500">確定したシフトで、何時に誰が入っているかを見られます</p>
        </div>
        <StoreSelect stores={stores ?? []} value={store.id} params={{ view, d: date }} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-bold">
          {VIEWS.map(([v, l]) => (
            <Link key={v} href={link(v, date)} className={`rounded-md px-5 py-1.5 ${view === v ? "bg-white text-brand shadow-sm" : "text-slate-500"}`}>
              {l}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link href={link(view, prev)} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            ‹ 前
          </Link>
          <span className="px-1 text-sm font-bold text-slate-800">{title}</span>
          <Link href={link(view, next)} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            次 ›
          </Link>
          <Link href={link(view, today)} className="ml-1 rounded-md border border-line px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
            今日
          </Link>
        </div>
      </div>

      {view === "day" && <DayView date={date} today={today} work={work} people={people} axis={axis} />}
      {view === "week" && <WeekView days={weekDays(monday)} today={today} shifts={shifts} people={people} axis={axis} dayLink={(d) => link("day", d)} />}
      {view === "month" && <MonthView month={month} from={from} to={to} today={today} work={work} people={people} dayLink={(d) => link("day", d)} />}
    </div>
  );
}

/** 1時間ごとの縦の区切り線 */
function HourLines({ axis }: { axis: [number, number] }) {
  return (
    <>
      {hourTicks(axis).map((h) => (
        <span key={h} className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${barPos([h, h], axis).left}%` }} />
      ))}
    </>
  );
}

function DayView({ date, today, work, people, axis }: { date: string; today: string; work: ScheduleRow[]; people: SchedulePerson[]; axis: [number, number] }) {
  const ticks = hourTicks(axis);
  const nameOf = new Map(people.map((p) => [p.id, p]));
  const rows = work
    .map((s) => ({ s, sp: span(s.planned_start, s.planned_end), p: nameOf.get(s.staff_id) }))
    .sort((a, b) => (a.sp?.[0] ?? 0) - (b.sp?.[0] ?? 0) || (a.sp?.[1] ?? 0) - (b.sp?.[1] ?? 0));
  const spans = rows.map((r) => r.sp).filter((x): x is [number, number] => !!x);
  // 今の時刻の線（今日だけ）
  const now = new Date(Date.now() + 9 * 3_600_000);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nowPos = date === today && nowMin >= axis[0] && nowMin <= axis[1] ? barPos([nowMin, nowMin], axis).left : null;

  if (!rows.length) return <p className="rounded-md border border-line bg-white p-6 text-center text-sm text-slate-400">この日の確定したシフトはありません</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <div className="min-w-[640px]">
        <div className="flex border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
          <div className="sticky left-0 z-10 w-28 shrink-0 bg-slate-50 px-2 py-1.5 font-medium sm:w-36">時間</div>
          <div className="relative flex-1">
            {ticks.map((h) => (
              <span key={h} className="absolute top-1.5 -translate-x-1/2 tabular-nums" style={{ left: `${barPos([h, h], axis).left}%` }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex border-b border-slate-100 text-[11px]">
          <div className="sticky left-0 z-10 w-28 shrink-0 bg-white px-2 py-1 font-medium text-slate-500 sm:w-36">人数</div>
          <div className="flex flex-1">
            {ticks.map((h) => {
              const n = headcount(spans, h);
              return (
                <span key={h} className={`flex-1 border-l border-slate-100 py-1 text-center font-bold tabular-nums ${n ? "text-brand" : "text-slate-300"}`}>
                  {n}
                </span>
              );
            })}
          </div>
        </div>
        {rows.map(({ s, sp, p }) => {
          const pos = sp ? barPos(sp, axis) : null;
          return (
            <div key={s.staff_id} className="flex border-b border-slate-100 last:border-b-0">
              <div className="sticky left-0 z-10 w-28 shrink-0 bg-white px-2 py-2 sm:w-36">
                <p className="truncate text-sm font-bold text-slate-800">{p?.name ?? "—"}</p>
                {p?.help && <p className="text-[10px] text-slate-400">ヘルプ</p>}
              </div>
              <div className="relative flex-1">
                <HourLines axis={axis} />
                {nowPos !== null && <span className="absolute inset-y-0 z-[1] border-l-2 border-accent" style={{ left: `${nowPos}%` }} />}
                {pos && (
                  <div className="absolute inset-y-1.5 flex items-center overflow-hidden rounded bg-brand px-1.5 text-[11px] font-bold whitespace-nowrap text-white" style={{ left: `${pos.left}%`, width: `${pos.width}%` }}>
                    <span className="tabular-nums">
                      {hm(s.planned_start)}〜{hm(s.planned_end)}
                    </span>
                    {s.work_role && <span className="ml-1.5 font-normal opacity-80">{s.work_role}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ days, today, shifts, people, axis, dayLink }: { days: string[]; today: string; shifts: ScheduleRow[]; people: SchedulePerson[]; axis: [number, number]; dayLink: (d: string) => string }) {
  const withShift = new Set(shifts.map((s) => s.staff_id));
  // 行：この週にシフトがある人を先に、ほかの所属スタッフはあとに
  const rows = [...people].sort((a, b) => Number(withShift.has(b.id)) - Number(withShift.has(a.id)) || Number(a.help) - Number(b.help) || sortKey(a).localeCompare(sortKey(b), "ja"));
  const cell = (pid: string, d: string) => shifts.find((s) => s.staff_id === pid && s.work_date === d);
  const count = (d: string) => shifts.filter((s) => s.work_date === d && s.shift_type === "work").length;

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs text-slate-500">
            <th className="sticky left-0 z-10 w-28 bg-slate-50 px-2 py-2 text-left font-medium sm:w-36">スタッフ</th>
            {days.map((d) => (
              <th key={d} className={`border-l border-slate-100 px-1 py-1.5 font-medium ${d === today ? "bg-accent/10" : ""}`}>
                <Link href={dayLink(d)} className="block hover:underline">
                  <span className={`font-bold ${dowColor(d)}`}>
                    {md(d)}（{DOW[dowOf(d)]}）
                  </span>
                  <span className="block text-[10px] font-normal text-slate-400">{count(d)}人</span>
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-slate-100">
              <td className="sticky left-0 z-10 bg-white px-2 py-1.5">
                <p className="truncate font-bold text-slate-800">{p.name}</p>
                {p.help && <p className="text-[10px] text-slate-400">ヘルプ</p>}
              </td>
              {days.map((d) => {
                const s = cell(p.id, d);
                const sp = s?.shift_type === "work" ? span(s.planned_start, s.planned_end) : null;
                const pos = sp ? barPos(sp, axis) : null;
                return (
                  <td key={d} className={`border-l border-slate-100 px-1 py-1.5 align-top ${d === today ? "bg-accent/5" : ""}`}>
                    {s && s.shift_type === "work" ? (
                      <>
                        <p className="text-center text-[11px] font-bold text-brand tabular-nums">
                          {hm(s.planned_start)}〜{hm(s.planned_end)}
                        </p>
                        <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                          {pos && <span className="absolute inset-y-0 rounded-full bg-brand" style={{ left: `${pos.left}%`, width: `${pos.width}%` }} />}
                        </div>
                        {s.work_role && <p className="mt-0.5 truncate text-center text-[10px] text-slate-500">{s.work_role}</p>}
                      </>
                    ) : s ? (
                      <p className="text-center text-[11px] text-slate-400">{SHIFT_TYPES.find((t) => t.key === s.shift_type)?.label}</p>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
        バーは {hourLabel(axis[0])}時〜{hourLabel(axis[1])}時 の中での位置です。日付を押すと、その日のタイムラインを見られます
      </p>
    </div>
  );
}

function MonthView({ month, from, to, today, work, people, dayLink }: { month: string; from: string; to: string; today: string; work: ScheduleRow[]; people: SchedulePerson[]; dayLink: (d: string) => string }) {
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const weeks: string[][] = [];
  for (let mon = from; mon <= to; mon = addDays(mon, 7)) weeks.push(weekDays(mon));
  const on = (d: string) => work.filter((s) => s.work_date === d);

  return (
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
            const list = on(d);
            const outside = d.slice(0, 7) !== month;
            return (
              <Link
                key={d}
                href={dayLink(d)}
                className={`min-h-[84px] border-l border-slate-100 p-1 first:border-l-0 hover:bg-brand-soft/40 sm:p-1.5 ${outside ? "bg-slate-50/60 opacity-50" : ""} ${d === today ? "ring-2 ring-inset ring-accent" : ""}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className={`text-[11px] font-bold ${dowColor(d)}`}>{Number(d.slice(8, 10))}</span>
                  {list.length > 0 && <span className="text-[10px] font-bold text-brand">{list.length}人</span>}
                </div>
                {list.slice(0, 4).map((s) => (
                  <p key={s.staff_id} className="mt-0.5 truncate text-[10px] leading-tight text-slate-600 sm:text-[11px]">
                    <span className="hidden tabular-nums text-slate-400 sm:inline">{hm(s.planned_start)} </span>
                    {nameOf.get(s.staff_id) ?? "—"}
                  </p>
                ))}
                {list.length > 4 && <p className="text-[10px] text-slate-400">ほか{list.length - 4}人</p>}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
