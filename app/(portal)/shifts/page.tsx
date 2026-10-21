import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { attendanceScope } from "@/lib/attendance";
import { businessDayJST } from "@/lib/business-day";
import { canCallUrgent, isPast, mondayOf, monthDeadlines, periodTypeFor, URGENT_REASONS, weekDeadlines, weekDays } from "@/lib/shift-period";
import { hm } from "@/lib/shifts";
import { createAdminClient } from "@/lib/supabase/admin";
import { requiredBreak } from "@/lib/payroll/worktime";
import { ShiftGrid, type GridRow } from "./shift-grid";
import { DecideButton } from "./decide-button";
import { StorePicker } from "./store-picker";
import { PersonView } from "./person-view";

export const metadata = { title: "シフト確定" };

const DAY_MS = 86_400_000;
const shiftWeek = (monday: string, n: number) => new Date(Date.parse(`${monday}T12:00:00Z`) + n * 7 * DAY_MS).toISOString().slice(0, 10);
const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

export default async function ShiftsPage({ searchParams }: PageProps<"/shifts">) {
  const me = await requireStaff();
  const scope = await attendanceScope(me);
  if (!scope) redirect("/shifts/request");
  const sp = await searchParams;
  const admin = createAdminClient();
  const today = businessDayJST();

  let storesQuery = admin.from("stores").select("id, name, open_time, close_time, work_roles, shift_manager_staff_id, fulltime_weekly, monthly_holidays").eq("is_active", true).order("sort_order", { nullsFirst: false });
  if (!scope.all) storesQuery = storesQuery.in("id", scope.storeIds);
  const { data: stores } = await storesQuery;
  const store = (stores ?? []).find((s) => s.id === sp.store) ?? (stores ?? [])[0];
  if (!store) redirect("/");

  // 見方：人ごと（月のカレンダー、既定）／週の一覧（店の全員を1週間ずつ）
  const view = sp.view === "week" ? "week" : "person";
  const tabs = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">シフト確定</h1>
        <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-bold">
          {[
            ["person", "人ごと（月）"],
            ["week", "週の一覧"],
          ].map(([v, l]) => (
            <Link key={v} href={`/shifts?${new URLSearchParams({ store: store.id, view: v })}`} className={`rounded-md px-4 py-1.5 ${view === v ? "bg-white text-brand shadow-sm" : "text-slate-500"}`}>
              {l}
            </Link>
          ))}
        </div>
      </div>
      <Link href="/shifts/request" className="text-sm text-slate-500 hover:text-brand">
        自分のシフト希望 ›
      </Link>
    </div>
  );
  if (view === "person") {
    return (
      <div className="space-y-5">
        {tabs}
        <div className="flex flex-wrap items-center gap-3">
          <StorePicker stores={(stores ?? []).map((s) => ({ value: s.id, label: s.name }))} value={store.id} params={{ view: "person" }} />
        </div>
        <PersonView store={store} sp={sp} today={today} canAddAny={store.shift_manager_staff_id === me.id} />
      </div>
    );
  }

  // 既定の週：まだ確定期限を過ぎていない、いちばん近い週
  let monday = typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? mondayOf(sp.week) : mondayOf(today);
  if (typeof sp.week !== "string") while (isPast(weekDeadlines(monday).decide, today)) monday = shiftWeek(monday, 1);
  const days = weekDays(monday);
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];

  // 行：この店の在籍スタッフ＋この週にこの店のシフトがある人＋ヘルプとして追加した人
  const [{ data: members }, { data: storeShifts }] = await Promise.all([
    admin.from("staff").select("id, name, furigana, role").eq("store_id", store.id).eq("retired", false),
    admin.from("shift_schedule").select("staff_id").eq("store_id", store.id).in("work_date", days),
  ]);
  const extraIds = new Set((storeShifts ?? []).map((s) => s.staff_id));
  if (typeof sp.add === "string") extraIds.add(sp.add);
  for (const m of members ?? []) extraIds.delete(m.id);
  const { data: extras } = extraIds.size
    ? await admin.from("staff").select("id, name, furigana, role").in("id", [...extraIds]).eq("retired", false)
    : { data: [] };
  const people = [...(members ?? []), ...(extras ?? [])].filter((p) => periodTypeFor(p.role) || extraIds.has(p.id));
  const ids = people.map((p) => p.id);

  const [{ data: requests }, { data: shifts }, { data: subs }, { data: decisions }, { data: allStaff }] = await Promise.all([
    ids.length ? admin.from("shift_requests").select("staff_id, work_date, availability, preferred_start, preferred_end, source, decision").in("staff_id", ids).in("work_date", days) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("shift_schedule").select("staff_id, store_id, work_date, shift_type, planned_start, planned_end, work_role").in("staff_id", ids).in("work_date", days) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("shift_request_submissions").select("staff_id, period_type, period_start").in("staff_id", ids) : Promise.resolve({ data: [] }),
    admin.from("shift_decisions").select("period_type, period_start, decided_at").eq("store_id", store.id),
    admin.from("staff").select("id, name, department_name").eq("retired", false).neq("store_id", store.id).order("furigana"),
  ]);
  const { data: urgentCalls } = await admin.from("urgent_calls").select("work_date, created_at").eq("store_id", store.id).in("work_date", days);
  const submitted = new Set((subs ?? []).map((s) => `${s.staff_id}:${s.period_type}:${s.period_start}`));
  const decided = new Map((decisions ?? []).map((d) => [`${d.period_type}:${d.period_start}`, d.decided_at]));

  const rows: GridRow[] = people
    .sort((a, b) => (periodTypeFor(a.role) === "month" ? 0 : 1) - (periodTypeFor(b.role) === "month" ? 0 : 1) || (a.furigana || a.name).localeCompare(b.furigana || b.name, "ja"))
    .map((p) => {
      const type = periodTypeFor(p.role);
      // アルバイトは、希望が出ていない日はシフトに入れられない（店長から入れないか、をなくす）
      const partTime = type === "week";
      const notSubmitted =
        type === "week" ? !submitted.has(`${p.id}:week:${monday}`) : type === "month" ? months.some((m) => !submitted.has(`${p.id}:month:${m}-01`)) : false;
      return {
        id: p.id,
        name: p.name,
        kind: type === "month" ? "社員" : type === "week" ? "アルバイト" : "ヘルプ",
        help: !(members ?? []).some((m) => m.id === p.id),
        partTime,
        notSubmitted,
        cells: days.map((date) => {
          const r = (requests ?? []).find((x) => x.staff_id === p.id && x.work_date === date);
          const s = (shifts ?? []).find((x) => x.staff_id === p.id && x.work_date === date);
          return {
            date,
            request: r ? { a: r.availability, s: hm(r.preferred_start), e: hm(r.preferred_end), urgent: r.source === "urgent", rejected: r.decision === "rejected" } : null,
            shift: s ? { type: s.shift_type, s: hm(s.planned_start), e: hm(s.planned_end), role: s.work_role, otherStore: s.store_id !== store.id } : null,
            locked: date < today,
          };
        }),
      };
    });

  const unsubmitted = rows.filter((r) => r.notSubmitted);
  const q = (next: Record<string, string>) => `/shifts?${new URLSearchParams({ store: store.id, view: "week", week: monday, ...next })}`;

  return (
    <div className="space-y-5">
      {tabs}

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white p-3">
        <StorePicker stores={(stores ?? []).map((s) => ({ value: s.id, label: s.name }))} value={store.id} params={{ view: "week", week: monday }} />
        <div className="flex items-center gap-1">
          <Link href={q({ week: shiftWeek(monday, -1) })} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            ‹ 前の週
          </Link>
          <span className="px-2 text-sm font-bold text-slate-800">
            {md(days[0])}〜{md(days[6])}
          </span>
          <Link href={q({ week: shiftWeek(monday, 1) })} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            次の週 ›
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {months.map((m) => {
          const key = `month:${m}-01`;
          return (
            <div key={m} className="rounded-md border border-line bg-white p-4 text-sm">
              <p className="font-bold text-slate-800">社員の{Number(m.slice(5))}月分</p>
              <p className="text-xs text-slate-500">確定期限：{md(monthDeadlines(m).decide)}</p>
              <DecideButton storeId={store.id} type="month" start={`${m}-01`} decidedAt={decided.get(key) ?? null} label={`${Number(m.slice(5))}月の社員シフトを確定`} />
            </div>
          );
        })}
        <div className="rounded-md border border-line bg-white p-4 text-sm">
          <p className="font-bold text-slate-800">{store.fulltime_weekly ? "この週（社員・アルバイト）" : "アルバイトのこの週"}</p>
          <p className="text-xs text-slate-500">
            確定期限：{md(weekDeadlines(monday).decide)}
            {store.fulltime_weekly && "。確定すると、社員に1週間の勤務が LINE で届きます"}
          </p>
          <DecideButton
            storeId={store.id}
            type="week"
            start={monday}
            decidedAt={decided.get(`week:${monday}`) ?? null}
            label={store.fulltime_weekly ? "この週を確定（社員に LINE で知らせる）" : "この週のアルバイトを確定済み"}
          />
        </div>
      </div>

      {store.fulltime_weekly && <WeekCheck storeId={store.id} days={days} people={people.filter((p) => periodTypeFor(p.role) === "month").map((p) => ({ id: p.id, name: p.name }))} monthlyHolidays={store.monthly_holidays} />}

      {unsubmitted.length > 0 && (
        <p className="rounded-md bg-accent-soft px-4 py-3 text-sm text-accent">
          <span className="font-bold">希望の未提出：</span>
          {unsubmitted.map((r) => r.name).join("、")}
        </p>
      )}

      <ShiftGrid
        storeId={store.id}
        days={days}
        urgentDays={days.filter((d) => canCallUrgent(d, today))}
        urgentReasons={URGENT_REASONS}
        urgentUsed={Object.fromEntries(days.map((d) => [d, (urgentCalls ?? []).filter((c) => c.work_date === d).length]))}
        rows={rows}
        roles={store.work_roles ?? []}
        defaults={{ start: store.open_time ?? "19:00", end: store.close_time ?? "00:00" }}
        canAddAny={store.shift_manager_staff_id === me.id}
      />

      {me.isAdmin && (
        <p className="text-right text-xs">
          <Link href={`/admin/stores/${store.id}`} className="text-brand hover:underline">
            ＋ この店の役割を追加・変更する（管理者）
          </Link>
        </p>
      )}

      <form action="/shifts" className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="store" value={store.id} />
        <input type="hidden" name="week" value={monday} />
        <input type="hidden" name="view" value="week" />
        <span className="text-slate-500">ほかの店舗のスタッフをヘルプで追加：</span>
        <select name="add" defaultValue="" className="rounded-lg border border-slate-300 bg-white px-3 py-2">
          <option value="" disabled>
            選んでください
          </option>
          {(allStaff ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}（{s.department_name ?? "所属なし"}）
            </option>
          ))}
        </select>
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium hover:border-brand">追加</button>
      </form>
    </div>
  );
}

/**
 * 社員を週ごとに確定する店の、週の見張り（2026-10-21）。社員ごとに、この週の勤務時間（予定・休憩込み）・1日10時間を超える日・今月の公休の数。
 * 1週間単位の非定型的変形労働時間制：週40時間・1日10時間まで。週の中で入れ替えても、月の公休の数は変えない
 */
async function WeekCheck({ storeId, days, people, monthlyHolidays }: { storeId: string; days: string[]; people: { id: string; name: string }[]; monthlyHolidays: number | null }) {
  if (!people.length) return null;
  const admin = createAdminClient();
  const month = days[3].slice(0, 7);
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const { data: rows } = await admin
    .from("shift_schedule")
    .select("staff_id, work_date, shift_type, planned_start, planned_end")
    .eq("store_id", storeId)
    .in("staff_id", people.map((p) => p.id))
    .or(`work_date.in.(${days.join(",")}),and(work_date.gte.${month}-01,work_date.lte.${month}-${last})`);
  const minutes = (a: string | null, b: string | null) => {
    if (!a || !b) return 0;
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    let m = bh * 60 + bm - (ah * 60 + am);
    if (m <= 0) m += 24 * 60;
    return m;
  };
  const list = people.map((p) => {
    const mine = (rows ?? []).filter((r) => r.staff_id === p.id);
    const week = mine.filter((r) => days.includes(r.work_date) && r.shift_type === "work");
    const worked = (r: { planned_start: string | null; planned_end: string | null }) => {
      const span = minutes(r.planned_start, r.planned_end);
      return span - requiredBreak(span);
    };
    const total = week.reduce((a, r) => a + worked(r), 0);
    const long = week.filter((r) => worked(r) > 600).map((r) => r.work_date);
    const off = mine.filter((r) => r.work_date.startsWith(month) && r.shift_type === "off").length;
    // 今月の残業の見込み：1日8時間を超える分の合計（固定残業は30時間分）
    const overtime = mine.filter((r) => r.work_date.startsWith(month) && r.shift_type === "work").reduce((a, r) => a + Math.max(0, worked(r) - 480), 0);
    return { ...p, total, long, off, overtime };
  });
  const h = (m: number) => `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ""}`;
  return (
    <section className="rounded-md border border-line bg-white p-4 text-sm">
      <p className="font-bold text-slate-800">社員のこの週（予約に合わせた入れ替えの確認）</p>
      <p className="text-xs text-slate-500">勤務時間はシフトの予定（休憩を除く）。1日10時間まで、月の公休の数は変えない。残業の見込みは1日8時間を超える分で、固定残業は30時間分</p>
      <ul className="mt-2 divide-y divide-slate-100">
        {list.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
            <span className="w-28 font-bold text-slate-800">{p.name}</span>
            <span className={p.total > 40 * 60 ? "font-bold text-accent" : "text-slate-700"}>今週 {h(p.total)}</span>
            {p.long.length > 0 && <span className="font-bold text-accent">10時間超：{p.long.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join("・")}</span>}
            <span className={p.overtime > 30 * 60 ? "font-bold text-accent" : "text-slate-500"}>今月の残業見込み {h(p.overtime)} / 30時間</span>
            <span className={monthlyHolidays !== null && p.off < monthlyHolidays ? "text-amber-700" : "text-slate-500"}>
              {Number(month.slice(5))}月の公休 {p.off}
              {monthlyHolidays !== null ? ` / ${monthlyHolidays}日` : "日"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
