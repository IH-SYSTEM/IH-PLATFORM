import { requireStaff, type CurrentStaff } from "@/lib/auth";
import { announcementsFor } from "@/lib/announcements";
import { attendanceScope } from "@/lib/attendance";
import { businessDayJST, toJSTTimeLabel } from "@/lib/business-day";
import { punchStatus } from "@/lib/punch";
import { routineTodos } from "@/lib/routines";
import {
  isPast,
  monthPeriod,
  partTimeWeeks,
  periodTypeFor,
} from "@/lib/shift-period";
import { visibleShifts } from "@/lib/shifts";
import { createAdminClient } from "@/lib/supabase/admin";
import { HomeView, type Todo } from "@/app/home-view";
import { Toast } from "@/app/toast";

// ホーム：本日の業務／会社からのお知らせ／システムの更新／全国ニュース の4つだけ

const md = (d: string) =>
  `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${"日月火水木金土"[new Date(`${d}T00:00:00Z`).getUTCDay()]}）`;

async function todayWork(me: CurrentStaff) {
  const admin = createAdminClient();
  const today = businessDayJST();
  const { data: self } = await admin
    .from("staff")
    .select("role")
    .eq("id", me.id)
    .single();
  const [shifts, punch] = await Promise.all([
    visibleShifts(me.id, self?.role ?? null, today, today),
    punchStatus(me.id),
  ]);
  const shift = shifts.find((s) => s.work_date === today) ?? null;
  const { data: store } = shift?.store_id
    ? await admin
        .from("stores")
        .select("name")
        .eq("id", shift.store_id)
        .maybeSingle()
    : { data: null };

  // やること：シフト希望の出し忘れ／退勤の記録がない日（店長）／未処理の報告（本部）
  const todos: Todo[] = [];
  const type = periodTypeFor(self?.role);
  if (type) {
    const period =
      type === "week"
        ? partTimeWeeks(today)[0]
        : (() => {
            let ym = today.slice(0, 7);
            for (let i = 0; i < 3 && isPast(monthPeriod(ym).submit, today); i++)
              ym = `${ym.slice(0, 4)}-${String(Number(ym.slice(5)) + 1).padStart(2, "0")}`;
            return monthPeriod(ym);
          })();
    const { data: sub } = await admin
      .from("shift_request_submissions")
      .select("id")
      .eq("staff_id", me.id)
      .eq("period_type", type)
      .eq("period_start", period.start)
      .maybeSingle();
    if (!sub)
      todos.push({
        label: `シフト希望（${period.label}）を${md(period.submit)}までに出す`,
        href: "/shifts/request",
      });
  }
  const scope = await attendanceScope(me);
  if (scope) {
    let q = admin
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .is("checkout_time", null)
      .not("checkin_time", "is", null)
      .lt("date", today);
    if (!scope.all) q = q.in("store_id", scope.storeIds);
    const { count } = await q;
    if (count)
      todos.push({
        label: `退勤の記録がない日が${count}件あります`,
        href: "/attendance",
      });
  }
  if (me.isAdmin) {
    let q = admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (me.permission !== "superadmin") q = q.neq("category", "harassment");
    const { count } = await q;
    if (count)
      todos.push({
        label: `未処理の報告が${count}件あります`,
        href: "/admin/reports",
      });
  }

  // 定型業務（担当の人には自分の分、ほかの管理者には期限切れのものだけ）
  for (const r of await routineTodos(me)) {
    todos.push({
      label: r.label,
      href: r.href,
      tone: r.overdue ? "alert" : "task",
      done: r.manual
        ? { routineId: r.id, periodStart: r.periodStart }
        : undefined,
    });
  }

  const punchLabel =
    punch.kind === "working"
      ? `勤務中（${toJSTTimeLabel(punch.checkinTime, today)}〜）`
      : punch.kind === "done"
        ? `退勤済み（${toJSTTimeLabel(punch.checkinTime, today)}〜${toJSTTimeLabel(punch.checkoutTime, today)}）`
        : "まだ出勤していません";
  return {
    shift,
    storeName: store?.name ?? null,
    punchLabel,
    working: punch.kind === "working",
    todos,
  };
}

export default async function PortalHome({ searchParams }: PageProps<"/">) {
  const { line } = await searchParams;
  const me = await requireStaff();
  const [work, notices, system, news] = await Promise.all([
    todayWork(me),
    announcementsFor(me.id, "notice", 5),
    announcementsFor(me.id, "system", 3),
    announcementsFor(me.id, "news", 5),
  ]);
  const today = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  return (
    <>
      <HomeView
        name={me.name}
        today={today}
        work={work}
        notices={notices}
        system={system}
        news={news}
      />
      {line === "linked" && <Toast message="LINEと連携しました" />}
    </>
  );
}
