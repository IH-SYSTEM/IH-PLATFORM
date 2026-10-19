import "server-only";
import { toJSTDateString } from "@/lib/business-day";
import { pushLine } from "@/lib/line-push";
import { approversOf } from "@/lib/punch-rules";
import { addDays, monthPeriod, nextMonth, partTimeWeeks, periodTypeFor, weekOfMonthLabel, type Period, type PeriodType } from "@/lib/shift-period";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * シフトの LINE を自動で送る（毎日12時。2026-10-19 黒田さん決定）。
 * 組織図の部署ごとに、シフトの対象（アルバイト・正社員・契約社員）を数えて、文言を変える。
 *   複数の部署
 *     スタッフ … 提出期限の前日に「明日が提出期限」。まだ出していない人だけ
 *     店長     … 確定日に「今日は確定日。まだ出していない人：◯◯」
 *   1人の部署（自分でシフトを入れる）
 *     本人     … 確定日の前日に「ご自身のシフトを確定日までに入力して確定」。提出期限の LINE は送らない
 *   アルバイト＝週ごと（提出期限＝前々週の日曜・確定日＝前週の水曜）、正社員・契約社員＝月ごと（提出期限＝前の月の15日・確定日＝前の月の20日）
 */
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${"日月火水木金土"[new Date(`${d}T12:00:00Z`).getUTCDay()]}）`;
const periodName = (p: Period) => (p.type === "week" ? `${weekOfMonthLabel(p.start)}（${p.label}）` : `${p.label}`);
const short = (n: string) => n.split(/[\s　]/)[0];

/** その日に関係する期間（週は4週先まで、月は翌月・翌々月） */
function periodsAround(today: string): Period[] {
  const ym = today.slice(0, 7);
  return [...partTimeWeeks(addDays(today, -7), 6), monthPeriod(nextMonth(ym)), monthPeriod(nextMonth(nextMonth(ym)))];
}

export type ShiftNotice = { to: string; unit: string; kind: "submit" | "decide" | "solo"; text: string };

export async function buildShiftNotices(today = toJSTDateString(new Date()), origin = "https://portal.ikkou-holdings.co.jp"): Promise<ShiftNotice[]> {
  const admin = createAdminClient();
  const [{ data: units }, { data: staff }] = await Promise.all([
    admin.from("org_units").select("id, name, store_id, head_staff_ids").eq("kind", "unit").not("store_id", "is", null).order("sort_order"),
    admin.from("staff").select("id, name, role, store_id, permission, line_user_id").eq("retired", false),
  ]);
  const { data: managed } = await admin.from("stores").select("id, manager_staff_ids");
  const periods = periodsAround(today);
  const starts = [...new Set(periods.map((p) => p.start))];
  const { data: subs } = await admin.from("shift_request_submissions").select("staff_id, period_type, period_start").in("period_start", starts);
  const submitted = new Set((subs ?? []).map((s) => `${s.staff_id}:${s.period_type}:${s.period_start}`));
  const canDecide = (p: { id: string; permission: string | null; store_id: string | null }) =>
    p.permission === "admin" || p.permission === "superadmin" || p.permission === "store" || (managed ?? []).some((s) => s.manager_staff_ids?.includes(p.id));

  const out: ShiftNotice[] = [];
  for (const u of units ?? []) {
    const members = (staff ?? []).filter((s) => s.store_id === u.store_id && periodTypeFor(s.role));
    if (!members.length) continue;
    const solo = members.length === 1;
    for (const type of ["week", "month"] as PeriodType[]) {
      const inType = members.filter((m) => periodTypeFor(m.role) === type);
      if (!inType.length) continue;
      for (const p of periods.filter((x) => x.type === type)) {
        if (solo) {
          // 1人の部署：確定日の前日に、本人へ
          if (today !== addDays(p.decide, -1)) continue;
          const me = inType[0];
          const href = canDecide(me) ? "/shifts" : "/shifts/request";
          out.push({
            to: me.id,
            unit: u.name,
            kind: "solo",
            text: `【シフト入力】${periodName(p)}のご自身のシフトを、明日 ${md(p.decide)} までに入力して確定してください\n${origin}${href}`,
          });
          continue;
        }
        // 複数の部署：提出期限の前日に、まだ出していない人へ
        if (today === addDays(p.submit, -1)) {
          for (const m of inType.filter((x) => !submitted.has(`${x.id}:${type}:${p.start}`)))
            out.push({ to: m.id, unit: u.name, kind: "submit", text: `【シフト希望】${periodName(p)}の希望の提出期限は、明日 ${md(p.submit)} です。まだの方は出してください\n${origin}/shifts/request` });
        }
        // 複数の部署：確定日に、店長へ
        if (today === p.decide) {
          const missing = inType.filter((x) => !submitted.has(`${x.id}:${type}:${p.start}`));
          const managers = (await approversOf(u.store_id!)).map((a) => a.id);
          for (const id of managers)
            out.push({
              to: id,
              unit: u.name,
              kind: "decide",
              text: `【シフト確定】${u.name}：今日 ${md(p.decide)} は${periodName(p)}${type === "week" ? "（アルバイト）" : "（社員）"}のシフト確定日です。\n${missing.length ? `まだ希望を出していない人：${missing.map((m) => short(m.name)).join("・")}` : "全員が希望を出しています"}\n${origin}/shifts`,
            });
        }
      }
    }
  }
  return out;
}

/** 12時の cron から。dry なら送らずに中身だけ返す */
export async function sendShiftNotices({ dry = false, origin, date }: { dry?: boolean; origin?: string; date?: string } = {}) {
  const notices = await buildShiftNotices(date, origin);
  if (dry || !notices.length) return notices.map((n) => ({ ...n, sent: false }));
  const { data: people } = await createAdminClient().from("staff").select("id, line_user_id").in("id", [...new Set(notices.map((n) => n.to))]);
  const line = new Map((people ?? []).map((p) => [p.id, p.line_user_id]));
  const out = [];
  for (const n of notices) {
    const r = await pushLine([line.get(n.to)], n.text, "other");
    out.push({ ...n, sent: !!line.get(n.to), result: r });
  }
  return out;
}
