import "server-only";
import { toJSTDateString } from "@/lib/business-day";
import { pushLine } from "@/lib/line-push";
import { shiftManagersOf } from "@/lib/punch-rules";
import { addDays, monthPeriod, nextMonth, offLimitFor, partTimeWeeks, periodTypeFor, weekOfMonthLabel, type Period, type PeriodType } from "@/lib/shift-period";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * シフトの LINE を自動で送る（毎日12時。2026-10-19 黒田さん決定）。
 * 組織図の部署ごとに、シフトの対象（アルバイト・正社員・契約社員）を数えて、文言を変える。
 *   複数の部署
 *     アルバイト … 毎週月曜に全員へ「希望を入れてください」（4週先までの週と、それぞれの締切）。締切の日曜に、まだの人へ「今日が締切」
 *     正社員     … 毎月15日に全員へ「翌月の休みの希望を20日までに」（店休日＋希望休◯日・それ以上は有給）。19日に、まだの人へ「明日20日が締切」
 *     シフト管理者 … 確定日（アルバイト＝水曜・正社員＝25日）に「今日は確定日。まだ出していない人：◯◯」（未設定なら店長・責任者）
 *   1人の部署（自分でシフトを入れる）
 *     本人 … 確定日の前日に「ご自身のシフトを確定日までに入力して確定」。案内・締切の LINE は送らない
 *   アルバイト＝週ごと（提出期限＝前々週の日曜・確定日＝前週の水曜）、正社員・契約社員＝月ごと（提出期限＝前の月の20日・確定日＝前の月の25日）
 */
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${"日月火水木金土"[new Date(`${d}T12:00:00Z`).getUTCDay()]}）`;
const periodName = (p: Period) => (p.type === "week" ? `${weekOfMonthLabel(p.start)}（${p.label}）` : `${p.label}`);
const short = (n: string) => n.split(/[\s　]/)[0];

/** その日に関係する期間（週は4週先まで、月は翌月・翌々月） */
function periodsAround(today: string): Period[] {
  const ym = today.slice(0, 7);
  return [...partTimeWeeks(addDays(today, -7), 6), monthPeriod(nextMonth(ym)), monthPeriod(nextMonth(nextMonth(ym)))];
}

export type ShiftNotice = { to: string; unit: string; kind: "announce" | "submit" | "decide" | "solo"; text: string };

export async function buildShiftNotices(today = toJSTDateString(new Date()), origin = "https://portal.ikkou-holdings.co.jp"): Promise<ShiftNotice[]> {
  const admin = createAdminClient();
  const [{ data: units }, { data: staff }] = await Promise.all([
    admin.from("org_units").select("id, name, store_id, head_staff_ids").eq("kind", "unit").not("store_id", "is", null).order("sort_order"),
    admin.from("staff").select("id, name, role, store_id, permission, line_user_id").eq("retired", false),
  ]);
  const { data: managed } = await admin.from("stores").select("id, manager_staff_ids, requested_off_limit, fulltime_weekly, monthly_holidays, closed_weekdays, closed_dates");
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const dom = Number(today.slice(8, 10));
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
      // 案内（複数の部署だけ）：アルバイトは毎週月曜、正社員は毎月15日に、全員へ
      if (!solo && type === "week" && dow === 1) {
        const weeks = partTimeWeeks(today);
        for (const m of inType)
          out.push({
            to: m.id,
            unit: u.name,
            kind: "announce",
            text: `【シフト希望】シフト希望を入れてください（4週先まで入れられます）\n${weeks.map((w) => `・${periodName(w)} 締切 ${md(w.submit)}`).join("\n")}\n${origin}/shifts/request`,
          });
      }
      if (!solo && type === "month" && dom === 15) {
        const next = monthPeriod(nextMonth(today.slice(0, 7)));
        const st = (managed ?? []).find((s) => s.id === u.store_id);
        const limit = st ? offLimitFor(next.days, st) : null;
        for (const m of inType)
          out.push({
            to: m.id,
            unit: u.name,
            kind: "announce",
            text: `【休みの希望】${next.label}の休みの希望を、${md(next.submit)} までに入れてください（先の月も入れられます）\n店休日は自動で休みです。${limit !== null ? `${next.label}の希望休は${limit}日まで${st?.monthly_holidays ? `（店休日と合わせて${st.monthly_holidays}日）` : ""}、` : ""}それより多く休むときは有給で申請してください\n${origin}/shifts/request`,
          });
      }
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
        // 複数の部署：締切の念押し。アルバイトは締切の日曜に「今日が締切」、正社員は締切の前日（19日）に「明日が締切」。まだ出していない人だけ
        const remind = type === "week" ? today === p.submit : today === addDays(p.submit, -1);
        if (remind) {
          for (const m of inType.filter((x) => !submitted.has(`${x.id}:${type}:${p.start}`)))
            out.push({
              to: m.id,
              unit: u.name,
              kind: "submit",
              text:
                type === "week"
                  ? `【シフト希望】今日 ${md(p.submit)} が、${periodName(p)}のシフト希望の締切です。まだの方は今日中に出してください\n${origin}/shifts/request`
                  : `【休みの希望】明日 ${md(p.submit)} が、${p.label}の休みの希望の締切です。まだの方は明日までに入れてください\n${origin}/shifts/request`,
            });
        }
        // 複数の部署：確定日に、店長へ
        if (today === p.decide) {
          const missing = inType.filter((x) => !submitted.has(`${x.id}:${type}:${p.start}`));
          const managers = (await shiftManagersOf(u.store_id!)).map((a) => a.id);
          for (const id of managers)
            out.push({
              to: id,
              unit: u.name,
              kind: "decide",
              text: `【シフト確定】${u.name}：今日 ${md(p.decide)} は${periodName(p)}${type === "week" ? ((managed ?? []).find((x) => x.id === u.store_id)?.fulltime_weekly ? "（社員・アルバイト）" : "（アルバイト）") : "（社員）"}のシフト確定日です。\n${missing.length ? `まだ希望を出していない人：${missing.map((m) => short(m.name)).join("・")}` : "全員が希望を出しています"}\n${origin}/shifts`,
            });
        }
      }
    }
  }
  return out;
}

/** 12時の cron から。dry なら送らずに中身だけ返す */
export async function sendShiftNotices({ dry = false, origin, date, kinds }: { dry?: boolean; origin?: string; date?: string; kinds?: string[] } = {}) {
  const notices = (await buildShiftNotices(date, origin)).filter((n) => !kinds?.length || kinds.includes(n.kind));
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
