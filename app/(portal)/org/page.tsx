import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { canAssign } from "@/lib/duties";
import { loadOrg, type OrgUnit, myLevel } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveHeads, saveTitle } from "./actions";
import { HeadsForm, TitleForm } from "./forms";

export const metadata = { title: "組織図" };

type Person = { id: string; name: string; store_id: string | null };
const short = (name: string) => name.replace(/[\s　]+/g, " ");

/**
 * 組織図（チャート・全スタッフ）。見られるのは社長・部長・経理主任（第２レイヤーまで。2026-10-13 黒田さん決定）。
 * グループ → 会社 → 事業・店 → 責任者・正社員・アルバイト。責任者と役職の変更はシステム担当か代表だけ（下にたたんで置く）
 */
export default async function OrgPage() {
  const me = await requireStaff();
  const org = await loadOrg();
  if ((await myLevel(me)) < 4) redirect("/");
  const editable = me.isAdmin && canAssign(me);
  const { data: stores } = await createAdminClient().from("stores").select("id, name");
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const staff: Person[] = org.staff.filter((s) => !s.name.startsWith("TEST-"));
  const root = org.units.find((u) => u.kind === "group");
  const children = (id: string) => org.units.filter((u) => u.parent_id === id);
  const titled = staff.filter((s) => org.staff.find((x) => x.id === s.id)?.org_title).map((s) => ({ ...s, title: org.staff.find((x) => x.id === s.id)!.org_title! }));
  const inUnit = (u: OrgUnit) => staff.filter((s) => s.store_id && u.store_id === s.store_id);
  const placed = new Set(org.units.filter((u) => u.store_id).flatMap((u) => inUnit(u).map((s) => s.id)));
  const unplaced = staff.filter((s) => !placed.has(s.id) && !titled.some((t) => t.id === s.id));
  const people = staff.map((s) => ({ id: s.id, name: s.name, store: storeName.get(s.store_id ?? "") ?? "未所属" }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">組織図</h1>
        <p className="mt-1 text-sm text-slate-500">全スタッフ {staff.length}人。社長・部長・経理主任だけが見られます</p>
      </div>

      {root && (
        <div className="overflow-x-auto pb-4">
          <div className="min-w-[60rem]">
            {/* グループ（第１・第２レイヤー） */}
            <div className="flex justify-center">
              <div className="rounded-lg border-2 border-slate-800 bg-slate-800 px-6 py-3 text-center text-white shadow">
                <p className="text-xs text-white/60">{root.name}</p>
                {titled
                  .sort((a, b) => (a.title === "社長" ? -1 : b.title === "社長" ? 1 : 0))
                  .map((t) => (
                    <p key={t.id} className={t.title === "社長" ? "text-lg font-bold" : "text-sm"}>
                      <span className="mr-2 text-xs text-white/60">{t.title}</span>
                      {short(t.name)}
                    </p>
                  ))}
              </div>
            </div>
            <div className="mx-auto h-5 w-px bg-slate-400" />

            {/* 会社 */}
            <div className="grid gap-4 border-t-2 border-slate-400 pt-0" style={{ gridTemplateColumns: `repeat(${children(root.id).length}, minmax(0, 1fr))` }}>
              {children(root.id).map((c) => (
                <div key={c.id} className="flex flex-col items-center">
                  <div className="h-5 w-px bg-slate-400" />
                  <div className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center shadow-sm">
                    <p className="text-xs font-bold text-slate-500">{c.code}</p>
                    <p className="text-sm font-bold text-slate-900">{c.name.replace("株式会社", "")}</p>
                  </div>
                  <div className="h-4 w-px bg-slate-300" />

                  {/* 事業・店 */}
                  <div className="w-full space-y-3">
                    {children(c.id).map((u) => {
                      const members = inUnit(u);
                      const heads = members.filter((s) => u.head_staff_ids.includes(s.id));
                      const outsideHeads = u.head_staff_ids.filter((id) => !members.some((m) => m.id === id)).map((id) => staff.find((s) => s.id === id)).filter(Boolean) as Person[];
                      const rest = members.filter((s) => !u.head_staff_ids.includes(s.id));
                      const full = rest.filter((s) => org.levelOf(s.id) === 2);
                      const part = rest.filter((s) => org.levelOf(s.id) <= 1);
                      return (
                        <div key={u.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="flex items-baseline justify-between gap-2">
                            <span className="font-bold text-slate-900">{u.name}</span>
                            <span className="text-xs text-slate-400">{members.length}人</span>
                          </p>
                          <div className="mt-2 rounded-md bg-brand/10 px-2 py-1 text-sm">
                            <span className="mr-1 text-xs text-brand">責任者</span>
                            <span className="font-bold text-brand">{[...heads, ...outsideHeads].map((h) => short(h.name)).join("・") || "—"}</span>
                          </div>
                          {full.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-slate-500">正社員 {full.length}</p>
                              <p className="text-sm text-slate-800">{full.map((s) => short(s.name)).join("・")}</p>
                            </div>
                          )}
                          {part.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-slate-500">アルバイト {part.length}</p>
                              <p className="text-sm text-slate-700">{part.map((s) => short(s.name)).join("・")}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {unplaced.length > 0 && (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-bold text-amber-900">組織図のどこにも入っていない人（{unplaced.length}人）</p>
          <p className="mt-1 text-amber-800">{unplaced.map((s) => `${short(s.name)}（${storeName.get(s.store_id ?? "") ?? "未所属"}）`).join("・")}</p>
          <p className="mt-1 text-xs text-amber-700">スタッフの所属の店を、組織図にある事業・店に変えると入ります</p>
        </section>
      )}

      {editable && root && (
        <details className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-bold text-slate-800">責任者・役職を変える</summary>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-bold text-slate-700">グループの役職（社長・部長・経理主任）</p>
              <div className="mt-2">
                <TitleForm people={people} action={saveTitle} />
              </div>
            </div>
            {children(root.id).flatMap((c) =>
              children(c.id).map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                  <span className="w-48 text-sm font-bold text-slate-700">
                    {c.code}・{u.name}
                  </span>
                  <HeadsForm heads={u.head_staff_ids} people={people} editable action={saveHeads.bind(null, u.id)} />
                </div>
              )),
            )}
          </div>
        </details>
      )}
    </div>
  );
}
