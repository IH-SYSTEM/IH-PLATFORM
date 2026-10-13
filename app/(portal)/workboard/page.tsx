import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { canUse } from "@/lib/modules";
import { loadOrg } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPORTANCE_MARK, TIMING_LABEL, targetsOf, workboardStores, type Notice, type Timing } from "@/lib/workboard";
import { addChecklistItem, createNotice, createSchedule, deleteSchedule, removeChecklistItem, stopNotice, toggleSchedule } from "./actions";
import { ActButton, ChecklistForm, NoticeForm } from "./forms";

export const metadata = { title: "ワークボード" };

const TABS = [
  ["notices", "お知らせ"],
  ["schedules", "定期配信"],
  ["checklist", "退勤チェックリスト"],
] as const;
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/**
 * ワークボード（モジュール）。打刻のときに必ず確かめてもらうお知らせ・定期配信・退勤チェックリストと、確認の状況。
 * 本部は全店、店長は自分の店の分を扱う
 */
export default async function WorkboardPage({ searchParams }: PageProps<"/workboard">) {
  const me = await requireStaff();
  if (!(await canUse(me, "workboard"))) redirect("/");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "notices";
  const scope = await workboardStores(me);
  const org = await loadOrg();
  const today = businessDayJST();
  const admin = createAdminClient();

  const [{ data: allStores }, { data: allStaff }] = await Promise.all([
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("staff").select("id, name, store_id").eq("retired", false).not("name", "like", "TEST-%").order("name"),
  ]);
  const stores = (allStores ?? []).filter((s) => scope.all || scope.storeIds.includes(s.id));
  const storeName = new Map((allStores ?? []).map((s) => [s.id, s.name]));
  // 選べる人：配下にいて、自分より下の段の人
  const staff = (allStaff ?? []).filter((s) => org.canReach(me.id, s.id));
  const staffName = new Map((allStaff ?? []).map((s) => [s.id, s.name]));
  // 自分の範囲のものだけ見せる（全員あては本部だけ、店あては自分の店が入っているもの、人あては自分の店の人が入っているもの）
  const visible = (n: { audience: string; audience_ids: string[] }) =>
    scope.all ||
    (n.audience === "store" && n.audience_ids.some((id) => scope.storeIds.includes(id))) ||
    (n.audience === "staff" && n.audience_ids.some((id) => staff.some((s) => s.id === id)));
  const audienceLabel = (n: { audience: string; audience_ids: string[] }) =>
    n.audience === "all" ? "全員" : n.audience === "store" ? n.audience_ids.map((id) => storeName.get(id) ?? "?").join("・") : n.audience_ids.map((id) => staffName.get(id) ?? "?").join("・");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ワークボード</h1>
        <p className="mt-1 text-sm text-slate-500">打刻のときに必ず確かめてもらうお知らせです。出勤前のものは確認しないと出勤できず、退勤前のものとチェックリストは済ませないと退勤できません</p>
      </div>
      <nav className="flex gap-1 border-b border-slate-200">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/workboard?tab=${k}`} className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold ${tab === k ? "border-brand text-brand" : "border-transparent text-slate-500"}`}>
            {l}
          </Link>
        ))}
      </nav>

      {tab === "notices" && (
        <NoticesTab today={today} visible={visible} audienceLabel={audienceLabel} staffName={staffName} allStaff={allStaff ?? []} levelOf={org.levelOf}>
          <NoticeForm
            mode="notice"
            stores={stores}
            staff={staff.map((s) => ({ id: s.id, name: s.name, store: storeName.get(s.store_id ?? "") ?? "" }))}
            canAll={scope.all}
            today={today}
            action={createNotice}
          />
        </NoticesTab>
      )}

      {tab === "schedules" && (
        <SchedulesTab visible={visible} audienceLabel={audienceLabel}>
          <NoticeForm
            mode="schedule"
            stores={stores}
            staff={staff.map((s) => ({ id: s.id, name: s.name, store: storeName.get(s.store_id ?? "") ?? "" }))}
            canAll={scope.all}
            today={today}
            action={createSchedule}
          />
        </SchedulesTab>
      )}

      {tab === "checklist" && (
        <ChecklistTab scopeAll={scope.all} storeIds={stores.map((s) => s.id)} storeName={storeName}>
          <ChecklistForm stores={stores} canAll={scope.all} action={addChecklistItem} />
        </ChecklistTab>
      )}
    </div>
  );
}

async function NoticesTab({
  today,
  visible,
  audienceLabel,
  staffName,
  allStaff,
  levelOf,
  children,
}: {
  levelOf: (id: string) => number;
  today: string;
  visible: (n: Notice) => boolean;
  audienceLabel: (n: Notice) => string;
  staffName: Map<string, string>;
  allStaff: { id: string; name: string; store_id: string | null }[];
  children: React.ReactNode;
}) {
  const admin = createAdminClient();
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await admin.from("workboard_notices").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(200).returns<Notice[]>();
  const notices = (data ?? []).filter(visible);
  const { data: reads } = notices.length ? await admin.from("workboard_reads").select("notice_id, staff_id, confirmed_at").in("notice_id", notices.map((n) => n.id)) : { data: [] };
  const live = (n: Notice) => n.is_active && n.starts_on <= today && (!n.ends_on || n.ends_on >= today);

  return (
    <div className="space-y-5">
      {children}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">最近30日のお知らせと確認の状況</h2>
        {notices.length === 0 && <p className="text-sm text-slate-400">まだありません</p>}
        {notices.map((n) => {
          const targets = targetsOf(n, allStaff, levelOf);
          const done = new Map((reads ?? []).filter((r) => r.notice_id === n.id).map((r) => [r.staff_id, r.confirmed_at]));
          const yet = targets.filter((t) => !done.has(t.id));
          return (
            <article key={n.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">
                    {IMPORTANCE_MARK[n.importance]} {n.importance}・{TIMING_LABEL[n.timing as Timing]}・{audienceLabel(n)}・{md(n.starts_on)}〜{n.ends_on ? md(n.ends_on) : "確認まで"}
                    {n.schedule_id && "・定期配信"}
                  </p>
                  <p className="font-bold text-slate-900">{n.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${live(n) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{live(n) ? "出しています" : n.is_active ? (n.starts_on > today ? "これから" : "終わり") : "止めました"}</span>
                  {n.is_active && <ActButton label="止める" act={stopNotice.bind(null, n.id)} confirmText="このお知らせを出すのをやめますか？（確認の記録は残ります）" />}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{n.body}</p>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-bold text-slate-700">
                  確認 {done.size}/{targets.length}人{yet.length > 0 && <span className="ml-2 text-amber-700">まだ {yet.length}人</span>}
                </summary>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {yet.map((t) => (
                    <span key={t.id} className="text-amber-700">
                      ・{t.name}（まだ）
                    </span>
                  ))}
                  {[...done].map(([id, at]) => (
                    <span key={id} className="text-slate-500">
                      ・{staffName.get(id) ?? "?"}（{new Date(at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）
                    </span>
                  ))}
                </div>
              </details>
            </article>
          );
        })}
      </section>
    </div>
  );
}

async function SchedulesTab({
  visible,
  audienceLabel,
  children,
}: {
  visible: (n: { audience: string; audience_ids: string[] }) => boolean;
  audienceLabel: (n: { audience: string; audience_ids: string[] }) => string;
  children: React.ReactNode;
}) {
  const { data } = await createAdminClient().from("workboard_schedules").select("*").order("created_at", { ascending: false });
  const rows = (data ?? []).filter(visible);
  const when = (s: { recurrence: string; day_of_month: number | null; day_of_week: number | null; on_date: string | null }) =>
    s.recurrence === "monthly" ? `毎月${s.day_of_month === 31 ? "末日" : `${s.day_of_month}日`}` : s.recurrence === "weekly" ? `毎週${WEEK[s.day_of_week ?? 0]}曜日` : `${md(s.on_date ?? "")}の1回`;
  return (
    <div className="space-y-5">
      {children}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700">定期配信の一覧</h2>
        {rows.length === 0 && <p className="text-sm text-slate-400">まだありません。例：毎週水曜「アルバイトの来週のシフト確定日です」、毎月末日「棚卸しの日です」</p>}
        {rows.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <div>
              <p className="text-xs text-slate-500">
                {when(s)}・{TIMING_LABEL[s.timing as Timing]}・{audienceLabel(s)}・{IMPORTANCE_MARK[s.importance]} {s.importance}
              </p>
              <p className={`font-bold ${s.is_active ? "text-slate-900" : "text-slate-400 line-through"}`}>{s.title}</p>
            </div>
            <div className="flex gap-2">
              <ActButton label={s.is_active ? "止める" : "再開する"} act={toggleSchedule.bind(null, s.id, !s.is_active)} />
              <ActButton label="消す" tone="danger" act={deleteSchedule.bind(null, s.id)} confirmText="この定期配信を消しますか？（もう出したお知らせは残ります）" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

async function ChecklistTab({ scopeAll, storeIds, storeName, children }: { scopeAll: boolean; storeIds: string[]; storeName: Map<string, string>; children: React.ReactNode }) {
  const { data } = await createAdminClient().from("workboard_checklist_items").select("id, label, store_id").eq("is_active", true).order("sort_order").order("created_at");
  const rows = (data ?? []).filter((i) => (i.store_id ? scopeAll || storeIds.includes(i.store_id) : true));
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.store_id ?? "";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">退勤のときに、全部にチェックを入れないと退勤できない項目です。その店の項目と、全店共通の項目が出ます</p>
      {children}
      {rows.length === 0 && <p className="text-sm text-slate-400">まだありません。例：レジ締めをした、ゴミを出した、エアコン・照明を切った、鍵を閉めた</p>}
      {[...groups].map(([k, items]) => (
        <section key={k} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800">{k ? storeName.get(k) : "全店共通"}</h3>
          <ul className="mt-2 space-y-1">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <span>☐ {i.label}</span>
                {(scopeAll || (i.store_id && storeIds.includes(i.store_id))) && <ActButton label="外す" tone="danger" act={removeChecklistItem.bind(null, i.id)} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
