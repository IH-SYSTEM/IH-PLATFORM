import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { yen } from "@/lib/format";
import { ADMIN_NAV } from "@/lib/admin-nav";

type Period = { year: number; month: number };
const key = (p: Period) => p.year * 100 + p.month;
const label = (p: Period) => `${p.year}年${p.month}月`;
const shift = (p: Period, delta: number): Period => {
  const i = p.year * 12 + (p.month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
};

async function loadDashboard() {
  const supabase = await createClient();
  const [{ data: staff }, { data: salary }, { data: login }] = await Promise.all([
    supabase.from("staff").select("id, retired, payroll_master, stores(name)"),
    supabase.from("salary_records").select("staff_id, year, month, status, total_payment"),
    supabase.rpc("staff_login_status"),
  ]);

  const jstNow = new Date(Date.now() + 9 * 3600_000);
  const target = shift({ year: jstNow.getUTCFullYear(), month: jstNow.getUTCMonth() + 1 }, -1);
  const prev = shift(target, -1);

  const active = (staff ?? []).filter((s) => !s.retired);
  const activeIds = new Set(active.map((s) => s.id));
  const inMonth = (p: Period) => (salary ?? []).filter((r) => key(r) === key(p));
  const targetRows = inMonth(target);
  const confirmed = targetRows.filter((r) => r.status === "confirmed");
  const drafts = targetRows.filter((r) => r.status === "draft");
  const entered = new Set(targetRows.map((r) => r.staff_id));
  const notEntered = active.filter((s) => s.payroll_master && !entered.has(s.id)).length;

  const sumConfirmed = (p: Period) =>
    inMonth(p)
      .filter((r) => r.status === "confirmed")
      .reduce((s, r) => s + Number(r.total_payment), 0);

  const months = Array.from({ length: 6 }, (_, i) => shift(target, i - 5)).map((p) => ({
    ...p,
    total: sumConfirmed(p),
  }));

  const byStore = new Map<string, number>();
  for (const s of active) {
    const name = (s.stores as unknown as { name: string } | null)?.name ?? "未所属";
    byStore.set(name, (byStore.get(name) ?? 0) + 1);
  }

  const loginRows = (login ?? []) as { staff_id: string; password_set: boolean }[];
  const migrated = loginRows.filter((r) => r.password_set && activeIds.has(r.staff_id)).length;

  return {
    target,
    activeCount: active.length,
    retiredCount: (staff ?? []).length - active.length,
    confirmed: confirmed.length,
    drafts: drafts.length,
    notEntered,
    targetTotal: sumConfirmed(target),
    prevTotal: sumConfirmed(prev),
    months,
    stores: [...byStore.entries()].sort((a, b) => b[1] - a[1]),
    migrated,
  };
}

export default async function AdminDashboard() {
  await requireAdmin();
  const d = await loadDashboard();
  const diff = d.targetTotal - d.prevTotal;
  const maxMonth = Math.max(...d.months.map((m) => m.total), 1);
  const maxStore = Math.max(...d.stores.map(([, n]) => n), 1);
  const migratedPct = d.activeCount ? Math.round((d.migrated / d.activeCount) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ダッシュボード</h1>
        <p className="mt-1 text-sm text-slate-500">給与計算の対象月：{label(d.target)}分</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="在籍スタッフ" value={`${d.activeCount}名`} note={`退職 ${d.retiredCount}名`} />
        <Kpi
          title={`${d.target.month}月分 給与入力`}
          value={`${d.confirmed}名 確定`}
          note={
            <>
              下書き {d.drafts}名 ・ 未入力{" "}
              <span className={d.notEntered ? "font-semibold text-amber-600" : ""}>{d.notEntered}名</span>
            </>
          }
        />
        <Kpi
          title={`${d.target.month}月分 支給総額`}
          value={yen(d.targetTotal)}
          note={
            d.prevTotal ? (
              <span className={diff >= 0 ? "text-rose-600" : "text-emerald-600"}>
                前月比 {diff >= 0 ? "+" : "−"}
                {yen(Math.abs(diff))}
              </span>
            ) : (
              "前月データなし"
            )
          }
        />
        <Kpi
          title="新システム移行"
          value={`${d.migrated} / ${d.activeCount}名`}
          note={
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${migratedPct}%` }} />
            </span>
          }
          href="/admin/login-status"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="月別 支給総額（確定分）" className="lg:col-span-3">
          <div className="flex h-48 items-end gap-3">
            {d.months.map((m) => (
              <div key={key(m)} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[11px] tabular-nums text-slate-500">
                  {m.total ? `${Math.round(m.total / 10000).toLocaleString()}万` : "—"}
                </span>
                <div
                  className={`w-full max-w-12 rounded-t-md ${key(m) === key(d.target) ? "bg-indigo-500" : "bg-slate-300"}`}
                  style={{ height: `${Math.max((m.total / maxMonth) * 100, 2)}%` }}
                />
                <span className="text-xs text-slate-500">{m.month}月</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="店舗別 在籍人数" className="lg:col-span-2">
          <ul className="space-y-3">
            {d.stores.map(([name, n]) => (
              <li key={name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="truncate text-slate-700">{name}</span>
                  <span className="ml-2 shrink-0 font-semibold tabular-nums text-slate-900">{n}名</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-700" style={{ width: `${(n / maxStore) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="メニュー">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_NAV.filter((n) => n.href !== "/admin").map((n) =>
            n.ready ? (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-xl border border-slate-200 px-4 py-3.5 text-sm font-medium text-slate-800 transition hover:border-indigo-400 hover:bg-indigo-50"
              >
                {n.label}
              </Link>
            ) : (
              <div
                key={n.href}
                className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 px-4 py-3.5 text-sm text-slate-400"
              >
                {n.label}
                <span className="text-xs">準備中</span>
              </div>
            ),
          )}
        </div>
      </Panel>
    </div>
  );
}

function Kpi({ title, value, note, href }: { title: string; value: string; note: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-slate-900">{value}</p>
      <div className="mt-1.5 text-xs text-slate-500">{note}</div>
    </>
  );
  const cls = "block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-indigo-300`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Panel({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}
