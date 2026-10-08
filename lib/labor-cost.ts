import "server-only";
import { dailyFixedCost, dayWorkCost } from "@/lib/payroll/labor-day";
import { wageOn, type WageRow } from "@/lib/payroll/wage-history";
import { workMonth, type DayInput, type OvertimeRule, type PayType } from "@/lib/payroll/worktime";
import { createAdminClient } from "@/lib/supabase/admin";

const AMOUNT_KEY = { monthly: "baseSalary", daily: "dailyWage", hourly: "hourlyWage", contract: "contractAmount" } as const;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
const daysInMonth = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();

export type LaborDay = { cost: number; workMinutes: number; hasAttendance: boolean };

/**
 * 店舗別・日別の人件費（見込み）。キーは `${店舗ID}:${日付}`。
 * 時給・日給の人は勤怠（打刻した店）から、月給・業務委託の人は月額を暦日で割って所属店に配る。役員は含めない。
 * hasAttendance＝その店のその日に勤怠の記録がある（ない日は人件費率を出さない）
 */
export async function laborByStoreDay(from: string, to: string): Promise<Map<string, LaborDay>> {
  const admin = createAdminClient();
  const readFrom = mondayOf(from); // 週40時間の残業を正しく数えるため、週の頭から読む
  const [{ data: attendance }, { data: shifts }, { data: stores }, { data: staff }, { data: history }] = await Promise.all([
    admin.from("attendance").select("staff_id, store_id, date, checkin_time, checkout_time, break_minutes").gte("date", readFrom).lte("date", to).limit(20000),
    admin.from("shift_schedule").select("staff_id, work_date, shift_type, planned_start, planned_end").gte("work_date", readFrom).lte("work_date", to).limit(20000),
    admin.from("stores").select("id, overtime_rule"),
    admin.from("staff").select("id, role, store_id, retired, payroll_master"),
    admin.from("staff_wage_history").select("staff_id, valid_from, valid_to, employment_type, amount").lte("valid_from", to).or(`valid_to.is.null,valid_to.gte.${from}`),
  ]);
  const ruleOf = new Map((stores ?? []).map((s) => [s.id, s.overtime_rule as OvertimeRule]));
  const shiftOf = new Map((shifts ?? []).map((s) => [`${s.staff_id}:${s.work_date}`, s]));
  const out = new Map<string, LaborDay>();
  const add = (store: string, date: string, cost: number, minutes = 0, attended = false) => {
    const k = `${store}:${date}`;
    const v = out.get(k) ?? { cost: 0, workMinutes: 0, hasAttendance: false };
    v.cost += cost;
    v.workMinutes += minutes;
    v.hasAttendance ||= attended;
    out.set(k, v);
  };

  for (const p of staff ?? []) {
    if (p.role === "officer") continue;
    const master = (p.payroll_master ?? {}) as Record<string, unknown> & { allowances?: Record<string, number> };
    const rows = ((history ?? []) as (WageRow & { staff_id: string })[]).filter((h) => h.staff_id === p.id);
    const wage = (date: string): { type: PayType; amount: number } | null => {
      const r = wageOn(rows, date);
      if (r) return { type: r.employment_type as PayType, amount: r.amount };
      const t = master.employmentType as PayType;
      return t in AMOUNT_KEY ? { type: t, amount: Number(master[AMOUNT_KEY[t]] ?? 0) } : null;
    };
    const allowances = Object.values(master.allowances ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);

    // 勤務した日の分（打刻した店に付ける）
    const mine = (attendance ?? []).filter((a) => a.staff_id === p.id);
    if (mine.length) {
      const days: DayInput[] = mine.map((a) => {
        const s = shiftOf.get(`${p.id}:${a.date}`);
        return {
          date: a.date,
          rule: ruleOf.get(a.store_id) ?? "statutory",
          checkin: a.checkin_time,
          checkout: a.checkout_time,
          breakMinutes: a.break_minutes ?? 0,
          shift: s?.shift_type === "work" && s.planned_start && s.planned_end ? { start: s.planned_start, end: s.planned_end } : null,
        };
      });
      const storeOf = new Map(mine.map((a) => [a.date, a.store_id]));
      for (const d of workMonth(days, from, to).days) {
        const w = wage(d.date);
        add(storeOf.get(d.date)!, d.date, w ? dayWorkCost(w.type, w.amount, d) : 0, d.worked, true);
      }
    }

    // 毎日配る分（在籍中・所属店がある人だけ）
    if (p.retired || !p.store_id) continue;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const w = wage(d);
      if (!w) continue;
      const fixed = dailyFixedCost(w.type, w.amount, allowances, daysInMonth(d));
      if (fixed) add(p.store_id, d, fixed);
    }
  }
  for (const v of out.values()) v.cost = Math.round(v.cost);
  return out;
}
