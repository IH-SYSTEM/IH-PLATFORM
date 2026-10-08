import "server-only";
import { employerWelfare, type Master } from "@/lib/payroll/calculator";
import { businessDaysInMonth, dayWorkCost } from "@/lib/payroll/labor-day";
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
 * アルバイト（時給・日給）は勤怠（打刻した店）×その日の金額。正社員（月給）は月給＋固定の手当＋会社負担の法定福利費を、
 * 所属店のその月の営業日（売上がある日）の数で割り、営業日ごとに配る。業務委託は委託額を同じように配る。役員は含めない。
 * hasAttendance＝その店のその日に勤怠の記録がある（ない日は人件費率を出さない）
 */
export async function laborByStoreDay(from: string, to: string): Promise<Map<string, LaborDay>> {
  const admin = createAdminClient();
  const readFrom = mondayOf(from); // 週40時間の残業を正しく数えるため、週の頭から読む
  const monthFrom = `${from.slice(0, 7)}-01`;
  const monthTo = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [{ data: attendance }, { data: shifts }, { data: stores }, { data: staff }, { data: history }, { data: salesDays }] = await Promise.all([
    admin.from("attendance").select("staff_id, store_id, date, checkin_time, checkout_time, break_minutes").gte("date", readFrom).lte("date", to).limit(20000),
    admin.from("shift_schedule").select("staff_id, work_date, shift_type, planned_start, planned_end").gte("work_date", readFrom).lte("work_date", to).limit(20000),
    admin.from("stores").select("id, overtime_rule"),
    admin.from("staff").select("id, role, store_id, retired, payroll_master"),
    admin.from("staff_wage_history").select("staff_id, valid_from, valid_to, employment_type, amount").lte("valid_from", to).or(`valid_to.is.null,valid_to.gte.${from}`),
    admin.from("pos_daily").select("store_id, business_date").gte("business_date", monthFrom).lte("business_date", monthTo).limit(20000),
  ]);
  // 営業日＝売上がある日。店・月ごとの営業日と、その月の営業日数（途中の月は見込み）
  const openDays = new Set((salesDays ?? []).map((d) => `${d.store_id}:${d.business_date}`));
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const bizCount = new Map<string, number>();
  const bizDaysOf = (store: string, date: string) => {
    const ym = date.slice(0, 7);
    const k = `${store}:${ym}`;
    if (!bizCount.has(k)) {
      const dim = daysInMonth(date);
      const elapsed = ym < today.slice(0, 7) ? dim : ym === today.slice(0, 7) ? Number(today.slice(8, 10)) - 1 : 0; // 今月は昨日までの日数
      const count = (salesDays ?? []).filter((d) => d.store_id === store && d.business_date.startsWith(ym)).length;
      bizCount.set(k, businessDaysInMonth(count, Math.max(elapsed, 1), dim));
    }
    return bizCount.get(k)!;
  };
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

    // 正社員・業務委託の月額を、所属店の営業日に配る（在籍中・所属店がある人だけ）
    if (p.retired || !p.store_id) continue;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const w = wage(d);
      if (!w || (w.type !== "monthly" && w.type !== "contract")) continue;
      const hasSales = (salesDays ?? []).some((x) => x.store_id === p.store_id && x.business_date.startsWith(d.slice(0, 7)));
      if (hasSales && !openDays.has(`${p.store_id}:${d}`)) continue; // 休業日には配らない
      const gross = w.amount + (w.type === "monthly" ? allowances : 0);
      const monthly = w.type === "monthly" ? gross + employerWelfare(gross, { ...(master as Master), employmentType: "monthly", baseSalary: w.amount }) : gross;
      add(p.store_id, d, monthly / bizDaysOf(p.store_id, d));
    }
  }
  for (const v of out.values()) v.cost = Math.round(v.cost);
  return out;
}
