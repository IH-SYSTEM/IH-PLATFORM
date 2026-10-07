import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { appsFor, SECTIONS, type PortalApp } from "@/lib/apps";
import { attendanceScope } from "@/lib/attendance";
import { yen } from "@/lib/format";
import { defaultPeriod, periodLabel } from "@/lib/payroll/period";
import { PortalHeader } from "./portal-header";
import { Icon } from "./icons";
import { MobileTabBar } from "./mobile-tab-bar";
import { Toast } from "./toast";

async function loadAdminBadges(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const p = defaultPeriod();
  const [{ data: staff }, { data: records }, { data: login }, { count: storeCount }, { count: pendingReports }] = await Promise.all([
    supabase.from("staff").select("id, retired"),
    supabase.from("salary_records").select("staff_id, status").eq("year", p.year).eq("month", p.month),
    supabase.rpc("staff_login_status"),
    supabase.from("stores").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const active = (staff ?? []).filter((s) => !s.retired);
  const activeIds = new Set(active.map((s) => s.id));
  const entered = new Set((records ?? []).map((r) => r.staff_id));
  const missing = active.filter((s) => !entered.has(s.id)).length;
  const confirmed = (records ?? []).filter((r) => r.status === "confirmed").length;
  const migrated = ((login ?? []) as { staff_id: string; password_set: boolean }[]).filter((r) => r.password_set && activeIds.has(r.staff_id)).length;
  return {
    salary: missing ? `${p.month}月分 未入力 ${missing}名` : `${p.month}月分 すべて入力済み`,
    "salary-history": `${p.month}月分 確定 ${confirmed}名`,
    staff: `在籍 ${active.length}名`,
    stores: `${storeCount ?? 0}店舗`,
    "login-status": `移行済み ${migrated} / ${active.length}名`,
    "report-inbox": pendingReports ? `未処理 ${pendingReports}件` : "未処理なし",
  };
}

export default async function PortalHome({ searchParams }: PageProps<"/">) {
  const { line } = await searchParams;
  const me = await requireStaff();
  const supabase = await createClient();
  const [{ data: profile }, { data: slip }, badges, scope] = await Promise.all([
    supabase.from("staff").select("department_name").eq("id", me.id).single(),
    supabase
      .from("salary_records")
      .select("id, year, month, net_payment")
      .eq("staff_id", me.id)
      .eq("status", "confirmed")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle(),
    me.isAdmin ? loadAdminBadges() : Promise.resolve({} as Record<string, string>),
    attendanceScope(me),
  ]);

  const apps = appsFor(me, scope !== null);
  const sections = (Object.keys(SECTIONS) as PortalApp["section"][]).filter((s) => apps.some((a) => a.section === s));

  return (
    <div className="min-h-screen">
      <PortalHeader staff={me} />

      <section className="bg-brand text-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          <p className="text-xs font-medium tracking-[0.2em] text-white/60">IKKOU HOLDINGS PORTAL</p>
          <h1 className="mt-2 text-xl font-bold sm:text-2xl">{me.name} さん</h1>
          <p className="mt-1 text-sm text-white/70">
            {profile?.department_name ?? "所属未設定"}
            {me.isAdmin && <span className="ml-2 rounded-sm bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white">管理者</span>}
          </p>
          {me.isAdmin && (
            <p className="mt-4 text-sm text-white/80">給与計算の対象月：{periodLabel(defaultPeriod())}分</p>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-8 px-4 pb-28 pt-6 lg:pb-12">
        {slip && (
          <Link href={`/me/salary/${slip.id}`} className="flex items-center justify-between gap-4 rounded-md border border-line border-l-4 border-l-accent bg-white px-5 py-4 transition hover:border-brand">
            <span>
              <span className="block text-xs text-slate-500">最新の給与明細（{slip.year}年{slip.month}月分）</span>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-brand">{yen(slip.net_payment)}</span>
            </span>
            <span className="shrink-0 text-sm font-bold text-accent">明細を見る ›</span>
          </Link>
        )}
        {sections.map((section) => (
          <section key={section}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-brand">
              <span className="h-4 w-1 bg-accent" />
              {SECTIONS[section]}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {apps
                .filter((a) => a.section === section)
                .map((a) => (
                  <AppTile key={a.id} app={a} badge={badges[a.id]} />
                ))}
            </div>
          </section>
        ))}
      </main>
      <MobileTabBar />
      {line === "linked" && <Toast message="LINEと連携しました" />}
    </div>
  );
}

function AppTile({ app, badge }: { app: PortalApp; badge?: string }) {
  const body = (
    <>
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-md ${app.ready ? "bg-brand-soft text-brand group-hover:bg-brand group-hover:text-white" : "bg-slate-100 text-slate-400"}`}
      >
        <Icon name={app.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`font-bold ${app.ready ? "text-slate-900" : "text-slate-400"}`}>{app.title}</span>
          {!app.ready && <span className="shrink-0 rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">準備中</span>}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">{app.description}</span>
        {badge && <span className="mt-2 block text-xs font-medium text-accent">{badge}</span>}
      </span>
    </>
  );
  const cls = "group flex min-h-[76px] items-start gap-3 rounded-md border border-line bg-white p-4";
  return app.ready ? (
    <Link href={app.href} className={`${cls} transition hover:border-brand hover:shadow-sm`}>
      {body}
    </Link>
  ) : (
    <div className={`${cls} cursor-default`}>{body}</div>
  );
}
