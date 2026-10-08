import Link from "next/link";
import { requireStaff, type CurrentStaff } from "@/lib/auth";
import { attendanceScope } from "@/lib/attendance";
import { businessDayJST } from "@/lib/business-day";
import { yen } from "@/lib/format";
import { defaultPeriod } from "@/lib/payroll/period";
import { isPast, monthPeriod, partTimeWeeks, periodTypeFor, weekDeadlines, mondayOf } from "@/lib/shift-period";
import { hm, visibleShifts } from "@/lib/shifts";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "./shell/app-shell";
import { PageHeader } from "./shell/page-header";
import { Toast } from "./toast";

// ホーム：メニューを並べるのではなく、その人が「今日やること」と「いまの状態」を出す（メニューはサイドバー・下のバー）
type Card = { label: string; value: string; note?: string; href: string; tone?: "alert" | "ok" | "plain" };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${"日月火水木金土"[new Date(`${d}T00:00:00Z`).getUTCDay()]}）`;

async function myCards(me: CurrentStaff): Promise<Card[]> {
  const admin = createAdminClient();
  const today = businessDayJST();
  const [{ data: self }, { data: slip }, { count: myPending }] = await Promise.all([
    admin.from("staff").select("role").eq("id", me.id).single(),
    admin
      .from("salary_records")
      .select("id, year, month, net_payment")
      .eq("staff_id", me.id)
      .eq("status", "confirmed")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", me.id).eq("status", "pending"),
  ]);
  const cards: Card[] = [];

  const next = (await visibleShifts(me.id, self?.role ?? null, today, `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`)).find((s) => s.shift_type === "work");
  cards.push(
    next
      ? { label: "次のシフト", value: `${md(next.work_date)} ${hm(next.planned_start)}〜${hm(next.planned_end)}`, note: next.work_role ?? undefined, href: "/shifts/request" }
      : { label: "次のシフト", value: "予定なし", href: "/shifts/request", tone: "plain" },
  );

  const type = periodTypeFor(self?.role);
  if (type) {
    const period = type === "week" ? partTimeWeeks(today)[0] : (() => {
      let ym = today.slice(0, 7);
      for (let i = 0; i < 3 && isPast(monthPeriod(ym).submit, today); i++) ym = `${ym.slice(0, 4)}-${String(Number(ym.slice(5)) + 1).padStart(2, "0")}`;
      return monthPeriod(ym);
    })();
    const { data: sub } = await admin.from("shift_request_submissions").select("id").eq("staff_id", me.id).eq("period_type", type).eq("period_start", period.start).maybeSingle();
    cards.push(
      sub
        ? { label: "シフト希望", value: `${period.label} 提出済み`, href: "/shifts/request", tone: "ok" }
        : { label: "シフト希望", value: `${period.label} 未提出`, note: `${md(period.submit)}まで`, href: "/shifts/request", tone: "alert" },
    );
  }

  cards.push(
    slip
      ? { label: "最新の給与明細", value: yen(slip.net_payment), note: `${slip.year}年${slip.month}月分`, href: `/me/salary/${slip.id}` }
      : { label: "給与明細", value: "まだありません", href: "/me", tone: "plain" },
  );
  if (myPending) cards.push({ label: "自分の報告", value: `確認中 ${myPending}件`, href: "/reports" });
  return cards;
}

async function managerCards(me: CurrentStaff): Promise<Card[]> {
  const scope = await attendanceScope(me);
  if (!scope) return [];
  const admin = createAdminClient();
  const today = businessDayJST();
  let q = admin.from("attendance").select("id", { count: "exact", head: true }).is("checkout_time", null).not("checkin_time", "is", null).lt("date", today);
  if (!scope.all) q = q.in("store_id", scope.storeIds);
  const { count: open } = await q;
  const monday = mondayOf(today);
  let nextMonday = monday;
  while (isPast(weekDeadlines(nextMonday).decide, today)) nextMonday = new Date(Date.parse(`${nextMonday}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  return [
    { label: "退勤の記録がない日", value: `${open ?? 0}件`, href: "/attendance", tone: open ? "alert" : "ok" },
    { label: "アルバイトのシフト確定", value: `${md(nextMonday)}からの週`, note: `${md(weekDeadlines(nextMonday).decide)} 24時まで`, href: "/shifts" },
  ];
}

async function adminCards(me: CurrentStaff): Promise<Card[]> {
  const admin = createAdminClient();
  const p = defaultPeriod();
  const [{ data: staff }, { data: records }, { count: pending }] = await Promise.all([
    admin.from("staff").select("id, retired, line_user_id, line_friend"),
    admin.from("salary_records").select("staff_id, status").eq("year", p.year).eq("month", p.month),
    me.permission === "superadmin"
      ? admin.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending")
      : admin.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending").neq("category", "harassment"),
  ]);
  const active = (staff ?? []).filter((s) => !s.retired);
  const entered = new Set((records ?? []).map((r) => r.staff_id));
  const missing = active.filter((s) => !entered.has(s.id)).length;
  const confirmed = (records ?? []).filter((r) => r.status === "confirmed").length;
  const unlinked = active.filter((s) => !s.line_user_id || s.line_friend !== true).length;
  return [
    { label: "報告の受付", value: pending ? `未処理 ${pending}件` : "未処理なし", href: "/admin/reports", tone: pending ? "alert" : "ok" },
    { label: `${p.month}月分の給与`, value: missing ? `未入力 ${missing}名` : "すべて入力済み", note: `確定 ${confirmed}名`, href: "/admin/salary", tone: missing ? "alert" : "ok" },
    { label: "LINE連携", value: unlinked ? `未連携 ${unlinked}名` : "全員連携済み", note: `在籍 ${active.length}名`, href: "/admin/staff", tone: unlinked ? "alert" : "ok" },
  ];
}

function CardGrid({ title, cards }: { title: string; cards: Card[] }) {
  if (!cards.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold tracking-[0.2em] text-slate-400">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`group rounded-md border bg-white p-5 transition hover:border-brand hover:shadow-sm ${c.tone === "alert" ? "border-accent/40 border-l-4 border-l-accent" : "border-line"}`}
          >
            <p className="text-xs font-medium text-slate-500">{c.label}</p>
            <p className={`mt-1.5 text-xl font-bold tabular-nums ${c.tone === "alert" ? "text-accent" : c.tone === "plain" ? "text-slate-400" : "text-slate-900"}`}>{c.value}</p>
            {c.note && <p className="mt-1 text-xs text-slate-500">{c.note}</p>}
            <p className="mt-3 text-xs font-bold text-brand opacity-0 transition group-hover:opacity-100">開く ›</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function PortalHome({ searchParams }: PageProps<"/">) {
  const { line } = await searchParams;
  const me = await requireStaff();
  const [mine, store, hq] = await Promise.all([myCards(me), managerCards(me), me.isAdmin ? adminCards(me) : Promise.resolve([])]);
  const today = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short" }).format(new Date());

  return (
    <AppShell staff={me}>
      <PageHeader title={`${me.name}さん`} description={`${today}　今日やることと、いまの状態です`} />
      <div className="space-y-8">
        <CardGrid title="わたし" cards={mine} />
        <CardGrid title="店舗" cards={store} />
        <CardGrid title="本部" cards={hq} />
      </div>
      {line === "linked" && <Toast message="LINEと連携しました" />}
    </AppShell>
  );
}
