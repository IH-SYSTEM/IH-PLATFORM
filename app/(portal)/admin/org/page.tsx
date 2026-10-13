import { requireAdmin } from "@/lib/auth";
import { canAssign } from "@/lib/duties";
import { LEVEL_LABELS, loadOrg, type OrgUnit } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveHeads, saveTitle } from "./actions";
import { HeadsForm, TitleForm } from "./forms";

export const metadata = { title: "組織図" };

/**
 * 組織図（2026-10-13）。グループ → 会社 → 事業・店 の木と、責任者・役職・各段の人数。
 * 段（社長 ＞ 部長・経理主任 ＞ 店長・事業責任者 ＞ 正社員 ＞ アルバイト）が、お知らせなどを出せる相手を決める
 */
export default async function OrgPage() {
  const me = await requireAdmin();
  const editable = canAssign(me);
  const org = await loadOrg();
  const { data: stores } = await createAdminClient().from("stores").select("id, name, code");
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const people = org.staff.filter((s) => !s.name.startsWith("TEST-")).map((s) => ({ id: s.id, name: s.name, store: storeName.get(s.store_id ?? "") ?? "未所属" }));
  const titled = org.staff.filter((s) => s.org_title);
  const root = org.units.find((u) => u.kind === "group");
  const children = (id: string) => org.units.filter((u) => u.parent_id === id);
  const membersOf = (u: OrgUnit) => {
    const ids = org.storesUnder(u.id);
    return org.staff.filter((s) => s.store_id && ids.includes(s.store_id) && !s.name.startsWith("TEST-"));
  };
  const counts = (u: OrgUnit) => {
    const m = membersOf(u);
    return [3, 2, 1].map((lv) => `${LEVEL_LABELS[lv]} ${m.filter((s) => org.levelOf(s.id) === lv).length}`).join("・");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">組織図</h1>
        <p className="mt-1 text-sm text-slate-500">
          階層は 社長 ＞ 部長・経理主任 ＞ 店長・事業責任者 ＞ 正社員 ＞ アルバイト。お知らせなどは、自分の配下の、自分より下の段の人にだけ出せます。
          正社員・アルバイトの段は雇用区分から自動で決まります（雇用区分は給与のため、立場・担当は権限のためで、別々です）。
          {editable ? "" : "変えられるのは「システム」の担当か代表だけです。"}
        </p>
      </div>

      {root && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">{root.name}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {titled.length ? titled.map((s) => `${s.org_title}：${s.name}`).join("　／　") : "役職の人がいません"}
            <span className="ml-2 text-xs text-slate-400">（グループ全体が配下）</span>
          </p>
          {editable && (
            <div className="mt-3">
              <TitleForm people={people} action={saveTitle} />
            </div>
          )}

          <div className="mt-5 space-y-4">
            {children(root.id).map((c) => (
              <div key={c.id} className="rounded-md border border-slate-200 p-4">
                <p className="font-bold text-slate-800">
                  <span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-white">{c.code}</span>
                  {c.name}
                </p>
                <ul className="mt-3 space-y-3">
                  {children(c.id).map((u) => (
                    <li key={u.id} className="rounded-md bg-slate-50 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-bold text-slate-800">
                          {u.name}
                          {u.store_id && <span className="ml-2 text-xs font-normal text-slate-400">店舗：{storeName.get(u.store_id)}</span>}
                        </p>
                        <p className="text-xs text-slate-500">{counts(u)}</p>
                      </div>
                      <div className="mt-2">
                        <HeadsForm heads={u.head_staff_ids} people={people} editable={editable} action={saveHeads.bind(null, u.id)} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
      {!root && <p className="text-sm text-slate-400">組織図がまだ入っていません</p>}
    </div>
  );
}
