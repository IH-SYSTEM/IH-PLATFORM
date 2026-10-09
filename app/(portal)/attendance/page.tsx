import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { summarize } from "@/lib/attendance";
import { formatMinutes, toJSTTimeLabel } from "@/lib/business-day";
import { jpDate, roleLabel, yen } from "@/lib/format";
import { EMPLOYMENT_TYPES } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { Toast } from "@/app/toast";
import { FilterBar } from "./filter-bar";
import { resolveView } from "./view";

export const metadata = { title: "勤怠" };

const weekday = (ymd: string) => "日月火水木金土"[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const me = await requireStaff();
  const sp = await searchParams;
  const view = await resolveView(me, sp);
  if (!view) redirect("/");
  const { stores, store, month, staff, staffId, rows } = view;
  const total = summarize(rows);
  const storeOptions = [...(view.scope.all ? [{ value: "all", label: "全店舗" }] : []), ...stores.map((s) => ({ value: s.id, label: s.name }))];
  const multiStore = store === "all";
  const exportQuery = new URLSearchParams({ store, month, ...(staffId ? { staff: staffId } : {}) });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">勤怠</h1>
        <div className="flex gap-2">
          {me.isAdmin && (
            <Link
              href={`/attendance/edit/new?${new URLSearchParams({ ...(store !== "all" ? { store } : {}), ...(staffId ? { staff: staffId } : {}) })}`}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-2"
            >
              ＋ 記録を追加
            </Link>
          )}
          <a href={`/attendance/export?${exportQuery}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand">
            CSVで出力
          </a>
        </div>
      </div>

      <FilterBar stores={storeOptions} staff={staff.map((s) => ({ value: s.id, label: s.name }))} store={store} month={month} staffId={staffId} />

      {staffId && <StaffInfo staffId={staffId} showWage={me.isAdmin} />}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="出勤日数" value={`${total.days}日`} />
        <Stat label="実働の合計" value={formatMinutes(total.worked)} />
        <Stat label="休憩の合計" value={formatMinutes(total.breaks)} />
        <Stat label="退勤の記録なし" value={`${total.open}件`} alert={total.open > 0} />
        <Stat label="手入力（報告・本部）" value={`${total.manual}件`} />
      </dl>

      {rows.length === 0 ? (
        <p className="rounded-md border border-line bg-white p-8 text-center text-sm text-slate-500">この条件の打刻はありません</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">日付</th>
                {!staffId && <th className="px-3 py-2 text-left font-medium">スタッフ</th>}
                {multiStore && <th className="px-3 py-2 text-left font-medium">店舗</th>}
                <th className="px-3 py-2 text-right font-medium">出勤</th>
                <th className="px-3 py-2 text-right font-medium">退勤</th>
                <th className="px-3 py-2 text-right font-medium">休憩</th>
                <th className="px-3 py-2 text-right font-medium">実働</th>
                {me.isAdmin && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {rows.map((r) => (
                <tr key={r.id} className={r.checkin_time && !r.checkout_time ? "bg-accent-soft/50" : ""}>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    {Number(r.date.slice(5, 7))}/{Number(r.date.slice(8, 10))}（{weekday(r.date)}）
                    {r.source !== "qr" && (
                      <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                        {r.source === "report" ? "報告" : r.source === "demo" ? "デモ" : "本部入力"}
                      </span>
                    )}
                    {r.lastEdit && (
                      <span
                        title={`${r.lastEdit.reason}（${new Date(r.lastEdit.at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）`}
                        className="ml-1.5 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand"
                      >
                        修正：{r.lastEdit.by}
                      </span>
                    )}
                  </td>
                  {!staffId && (
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Link href={`/attendance?${new URLSearchParams({ store, month, staff: r.staff_id })}`} className="font-medium text-slate-800 hover:text-brand">
                        {r.staff_name}
                      </Link>
                    </td>
                  )}
                  {multiStore && <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{r.store_name}</td>}
                  <td className="px-3 py-2.5 text-right">{toJSTTimeLabel(r.checkin_time, r.date)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {r.checkout_time ? toJSTTimeLabel(r.checkout_time, r.date) : <span className="font-bold text-accent">未退勤</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{r.checkout_time ? `${r.break_minutes}分` : "—"}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-900">{formatMinutes(r.worked)}</td>
                  {me.isAdmin && (
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/attendance/edit/${r.id}`} className="text-xs font-bold text-brand hover:underline">
                        修正
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sp.saved === "1" && <Toast message="保存しました" />}
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-white px-4 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 text-lg font-bold tabular-nums ${alert ? "text-accent" : "text-slate-900"}`}>{value}</dd>
    </div>
  );
}

type PayrollMaster = { employmentType?: string; hourlyWage?: number; dailyWage?: number; baseSalary?: number } | null;

// スタッフを選んだときの情報カード。給与額は管理者だけに見せる（店長は既定で非表示）
async function StaffInfo({ staffId, showWage }: { staffId: string; showWage: boolean }) {
  const { data: s } = await createAdminClient()
    .from("staff")
    .select("name, furigana, role, department_name, hire_date, line_user_id, payroll_master")
    .eq("id", staffId)
    .single();
  if (!s) return null;
  const pm = s.payroll_master as PayrollMaster;
  const type = EMPLOYMENT_TYPES.find((t) => t.value === pm?.employmentType)?.label ?? "未設定";
  const wages = [
    pm?.hourlyWage ? `時給 ${yen(pm.hourlyWage)}` : null,
    pm?.dailyWage ? `日給 ${yen(pm.dailyWage)}` : null,
    pm?.baseSalary ? `基本給 ${yen(pm.baseSalary)}` : null,
  ].filter(Boolean);

  return (
    <section className="rounded-md border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs text-slate-400">{s.furigana}</p>
          <h2 className="text-lg font-bold text-slate-900">{s.name}</h2>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.line_user_id ? "bg-emerald-50 text-emerald-700" : "bg-accent-soft text-accent"}`}>
          {s.line_user_id ? "LINE連携済み" : "LINE未連携（打刻できません）"}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <Info label="所属" value={s.department_name ?? "—"} />
        <Info label="雇用区分" value={roleLabel(s.role)} />
        <Info label="入社日" value={jpDate(s.hire_date)} />
        {showWage ? <Info label={`給与（${type}）`} value={wages.join("／") || "未設定"} /> : <Info label="給与" value="管理者のみ表示" />}
      </dl>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  );
}
