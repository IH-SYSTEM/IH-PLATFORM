import Link from "next/link";
import { isPast, mondayOf, monthDeadlines, periodTypeFor, weekDeadlines } from "@/lib/shift-period";
import { hm } from "@/lib/shifts";
import { createAdminClient } from "@/lib/supabase/admin";
import { DecideButton } from "./decide-button";
import { PersonCalendar, type WeekStatus } from "./person-calendar";
import type { Cell, GridRow } from "./shift-grid";
import { StorePicker } from "./store-picker";

const DAY_MS = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const shiftMonth = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const minutes = (s: string | null, e: string | null) => {
  if (!s || !e) return 0;
  const a = Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  let b = Number(e.slice(0, 2)) * 60 + Number(e.slice(3, 5));
  if (b <= a) b += 24 * 60;
  return b - a;
};

type Store = { id: string; name: string; open_time: string | null; close_time: string | null; work_roles: string[] | null };
type Person = { id: string; name: string; furigana: string | null; role: string | null };

/** シフト確定の「人ごと」：1人を選んで、その月をカレンダーで見て直す */
export async function PersonView({ store, sp, today }: { store: Store; sp: Record<string, string | string[] | undefined>; today: string }) {
  const admin = createAdminClient();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const calStart = mondayOf(first);
  const calEnd = addDays(mondayOf(last), 6);

  // 選べる人：この店の在籍スタッフ（社員・アルバイト）＋この月にこの店でシフトがあるヘルプの人
  const [{ data: members }, { data: monthShifts }] = await Promise.all([
    admin.from("staff").select("id, name, furigana, role").eq("store_id", store.id).eq("retired", false),
    admin.from("shift_schedule").select("staff_id").eq("store_id", store.id).gte("work_date", first).lte("work_date", last),
  ]);
  const memberIds = new Set((members ?? []).map((m) => m.id));
  const helpIds = [...new Set((monthShifts ?? []).map((s) => s.staff_id))].filter((id) => !memberIds.has(id));
  const { data: helpers } = helpIds.length ? await admin.from("staff").select("id, name, furigana, role").in("id", helpIds) : { data: [] };
  const people: (Person & { help: boolean })[] = [
    ...(members ?? []).filter((p) => periodTypeFor(p.role)).map((p) => ({ ...p, help: false })),
    ...(helpers ?? []).map((p) => ({ ...p, help: true })),
  ].sort((a, b) => (periodTypeFor(a.role) === "month" ? 0 : 1) - (periodTypeFor(b.role) === "month" ? 0 : 1) || (a.furigana || a.name).localeCompare(b.furigana || b.name, "ja"));
  const person = people.find((p) => p.id === sp.person) ?? people[0];
  const base = { store: store.id, view: "person", month, ...(person ? { person: person.id } : {}) };
  const q = (next: Record<string, string>) => `/shifts?${new URLSearchParams({ ...base, ...next })}`;

  const header = (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white p-3">
      <StorePicker
        stores={people.map((p) => ({ value: p.id, label: `${p.name}（${p.help ? "ヘルプ" : periodTypeFor(p.role) === "month" ? "社員" : "アルバイト"}）` }))}
        value={person?.id ?? ""}
        params={base}
        name="person"
        placeholder="スタッフを選ぶ"
      />
      <div className="flex items-center gap-1">
        <Link href={q({ month: shiftMonth(month, -1) })} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          ‹ 前の月
        </Link>
        <span className="px-2 text-sm font-bold text-slate-800">
          {month.slice(0, 4)}年{Number(month.slice(5))}月
        </span>
        <Link href={q({ month: shiftMonth(month, 1) })} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          次の月 ›
        </Link>
      </div>
    </div>
  );
  if (!person) return <>{header}<p className="text-sm text-slate-400">この店にシフトを組むスタッフがいません</p></>;

  const type = periodTypeFor(person.role);
  const [{ data: requests }, { data: shifts }, { data: subs }, { data: decisions }] = await Promise.all([
    admin.from("shift_requests").select("work_date, availability, preferred_start, preferred_end, source").eq("staff_id", person.id).gte("work_date", calStart).lte("work_date", calEnd),
    admin.from("shift_schedule").select("store_id, work_date, shift_type, planned_start, planned_end, work_role").eq("staff_id", person.id).gte("work_date", calStart).lte("work_date", calEnd),
    admin.from("shift_request_submissions").select("period_type, period_start").eq("staff_id", person.id),
    admin.from("shift_decisions").select("period_type, period_start, decided_at").eq("store_id", store.id),
  ]);
  const submitted = new Set((subs ?? []).map((s) => `${s.period_type}:${s.period_start}`));
  const decided = new Map((decisions ?? []).map((d) => [`${d.period_type}:${d.period_start}`, d.decided_at as string]));

  const cellOf = (date: string): Cell => {
    const r = (requests ?? []).find((x) => x.work_date === date);
    const s = (shifts ?? []).find((x) => x.work_date === date);
    return {
      date,
      request: r ? { a: r.availability, s: hm(r.preferred_start), e: hm(r.preferred_end), urgent: r.source === "urgent" } : null,
      shift: s ? { type: s.shift_type, s: hm(s.planned_start), e: hm(s.planned_end), role: s.work_role, otherStore: s.store_id !== store.id } : null,
      locked: date < today,
    };
  };
  const weeks: (WeekStatus & { cells: (Cell | null)[] })[] = [];
  for (let monday = calStart; monday <= calEnd; monday = addDays(monday, 7)) {
    weeks.push({
      monday,
      decided: decided.has(`week:${monday}`),
      deadline: weekDeadlines(monday).decide,
      submitted: submitted.has(`week:${monday}`),
      cells: Array.from({ length: 7 }, (_, i) => cellOf(addDays(monday, i))),
    });
  }
  const row: GridRow = {
    id: person.id,
    name: person.name,
    kind: type === "month" ? "社員" : type === "week" ? "アルバイト" : "ヘルプ",
    help: person.help,
    partTime: type === "week",
    notSubmitted: false,
    cells: [],
  };

  const inMonth = (shifts ?? []).filter((s) => s.work_date >= first && s.work_date <= last && s.store_id === store.id);
  const work = inMonth.filter((s) => s.shift_type === "work");
  const total = work.reduce((m, s) => m + minutes(s.planned_start, s.planned_end), 0);
  const count = (t: string) => inMonth.filter((s) => s.shift_type === t).length;
  const waiting = (requests ?? []).filter((r) => r.work_date >= first && r.work_date <= last && r.availability !== "off" && !(shifts ?? []).some((s) => s.work_date === r.work_date)).length;

  return (
    <>
      {header}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-line bg-white px-5 py-4 text-sm">
          <p className="text-lg font-bold text-slate-900">{person.name}</p>
          <span>
            出勤 <b className="tabular-nums">{work.length}</b>日
          </span>
          <span>
            予定 <b className="tabular-nums">{Math.floor(total / 60)}</b>時間{total % 60 ? `${total % 60}分` : ""}
          </span>
          {count("off") > 0 && <span>公休 {count("off")}日</span>}
          {count("paid_leave") > 0 && <span>有給 {count("paid_leave")}日</span>}
          {waiting > 0 && <span className="font-bold text-amber-700">待機 {waiting}日</span>}
          {type === "month" && !submitted.has(`month:${first}`) && <span className="font-bold text-accent">{Number(month.slice(5))}月の希望が未提出</span>}
        </div>
        {type === "month" && (
          <div className="rounded-md border border-line bg-white px-5 py-3 text-sm">
            <p className="font-bold text-slate-800">この店の社員の{Number(month.slice(5))}月分</p>
            <p className="text-xs text-slate-500">確定期限：{Number(monthDeadlines(month).decide.slice(5, 7))}/{Number(monthDeadlines(month).decide.slice(8, 10))}</p>
            <DecideButton storeId={store.id} type="month" start={first} decidedAt={decided.get(`month:${first}`) ?? null} label={`${Number(month.slice(5))}月の社員シフトを確定`} />
          </div>
        )}
      </div>
      {type === "week" && (
        <p className="text-xs text-slate-500">
          アルバイトは週ごとに確定します。確定は［週の一覧］タブの「この週のアルバイトのシフトを確定」から（店の全員分をまとめて確定します）。
          {weeks.filter((w) => !w.decided && !isPast(w.deadline, today)).length > 0 && " 左の列が「未確定」の週が対象です。"}
        </p>
      )}
      <PersonCalendar
        storeId={store.id}
        row={row}
        month={month}
        weeks={weeks}
        roles={store.work_roles ?? []}
        defaults={{ start: store.open_time ?? "19:00", end: store.close_time ?? "00:00" }}
      />
    </>
  );
}
