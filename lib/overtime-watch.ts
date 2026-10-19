import "server-only";
import { toJSTDateString } from "@/lib/business-day";
import { pushLine } from "@/lib/line-push";
import { agreementYearStart, overtimeLevels } from "@/lib/payroll/fixed-overtime";
import { workMonth, type DayInput, type OvertimeRule } from "@/lib/payroll/worktime";
import { shiftManagersOf } from "@/lib/punch-rules";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 36協定の見張り（毎朝の cron から）。残業（日8時間・週40時間を超えた分。法定休日の勤務は除く）が
 * 月36時間・45時間、年度300時間・360時間を超えたら、その人の店のシフト管理者と、総務の担当・代表に LINE。同じ段階は1回だけ知らせる。
 * 承認前の残業も数える（あとで承認されるかもしれないので、早めに知らせる）。却下された分は数えない
 */
const WATCH_ROLES = ["fulltime", "contract", "parttime", "admin"]; // 雇われている人（役員・業務委託は対象外）

const mondayOf = (ymd: string) => {
  const ms = Date.parse(`${ymd}T12:00:00Z`);
  return new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
};

export async function watchOvertime({ dry = false } = {}) {
  const today = toJSTDateString(new Date());
  const yearStart = agreementYearStart(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = mondayOf(yearStart);
  const admin = createAdminClient();
  const [{ data: people }, { data: attendance }, { data: shifts }, { data: stores }, { data: sent }] = await Promise.all([
    admin.from("staff").select("id, name, store_id").in("role", WATCH_ROLES).eq("retired", false),
    admin.from("attendance").select("staff_id, store_id, date, checkin_time, checkout_time, break_minutes, noshift_status, overtime_status").gte("date", from).lte("date", today).limit(50000),
    admin.from("shift_schedule").select("staff_id, work_date, shift_type, planned_start, planned_end").gte("work_date", from).lte("work_date", today).eq("shift_type", "work").limit(50000),
    admin.from("stores").select("id, overtime_rule"),
    admin.from("overtime_alerts").select("staff_id, period, level").gte("period", yearStart.slice(0, 7)),
  ]);
  const ruleOf = new Map((stores ?? []).map((s) => [s.id, s.overtime_rule as OvertimeRule]));
  const shiftOf = new Map((shifts ?? []).map((s) => [`${s.staff_id}:${s.work_date}`, s]));
  const done = new Set((sent ?? []).map((s) => `${s.staff_id}:${s.period}:${s.level}`));
  const { data: soumu } = await admin.from("staff_duties").select("staff_id").eq("duty", "soumu");
  const hqIds = [...new Set([...(soumu ?? []).map((s) => s.staff_id), ...(process.env.CEO_STAFF_ID ? [process.env.CEO_STAFF_ID] : [])])];
  const { data: hq } = hqIds.length ? await admin.from("staff").select("id, line_user_id").in("id", hqIds).eq("retired", false) : { data: [] };

  const out: { name: string; month: number; year: number; alerts: string[] }[] = [];
  for (const p of people ?? []) {
    const days: DayInput[] = (attendance ?? [])
      .filter((a) => a.staff_id === p.id)
      .map((a) => {
        const s = shiftOf.get(`${p.id}:${a.date}`);
        return {
          date: a.date,
          rule: ruleOf.get(a.store_id) ?? "statutory",
          checkin: a.checkin_time,
          checkout: a.checkout_time,
          breakMinutes: a.break_minutes ?? 0,
          shift: s?.planned_start && s.planned_end ? { start: s.planned_start, end: s.planned_end } : null,
          overtimeApproved: a.overtime_status !== "rejected",
          excluded: a.noshift_status === "rejected",
        };
      });
    if (!days.length) continue;
    const month = workMonth(days, monthStart, today).overtimeMinutes;
    const year = workMonth(days, yearStart, today).overtimeMinutes;
    const levels = overtimeLevels(month, year).filter((l) => !done.has(`${p.id}:${l.key.startsWith("m") ? today.slice(0, 7) : yearStart.slice(0, 7)}:${l.key}`));
    if (!levels.length) continue;
    out.push({ name: p.name, month: Math.round(month / 6) / 10, year: Math.round(year / 6) / 10, alerts: levels.map((l) => l.text) });
    if (dry) continue;
    const managers = p.store_id ? await shiftManagersOf(p.store_id, p.id) : [];
    const to = [...new Set([...managers, ...(hq ?? [])].map((x) => x.line_user_id))];
    await pushLine(
      to,
      `【残業時間の注意】${p.name}さん\n${levels.map((l) => l.text).join("\n")}\n今月 ${Math.round(month / 6) / 10}時間／今年度 ${Math.round(year / 6) / 10}時間\n36協定の上限は月45時間・年360時間です。シフトを調整してください`,
      "report",
    );
    await admin.from("overtime_alerts").insert(levels.map((l) => ({ staff_id: p.id, period: l.key.startsWith("m") ? today.slice(0, 7) : yearStart.slice(0, 7), level: l.key })));
  }
  return out;
}
