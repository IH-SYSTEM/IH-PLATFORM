import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { DUTY_LABELS, canAssign } from "@/lib/duties";
import { POSITION_LABELS, RANK_GRANT_LABELS } from "@/lib/modules";
import { permissionLabel } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveModuleGrants } from "./actions";
import { GrantForm } from "./grant-form";

export const metadata = { title: "権限付与" };

/**
 * 権限付与（2026-10-13）。① 機能（モジュール）ごとに、使える立場・担当・個人を割り当てる。
 * ② 立場と担当（基本の仕事）の一覧と、担当ごとにできること。担当の付け外しは各スタッフの画面で
 */
export default async function PermissionsPage() {
  const me = await requireAdmin();
  const editable = canAssign(me);
  const admin = createAdminClient();
  const [{ data: modules }, { data: grants }, { data: duties }, { data: staff }, { data: staffDuties }, { data: stores }] = await Promise.all([
    admin.from("modules").select("key, label, description").order("sort_order"),
    admin.from("module_grants").select("module, grantee_type, grantee"),
    admin.from("duties").select("key, label, description").order("sort_order"),
    admin.from("staff").select("id, name, permission, store_id").eq("retired", false).not("name", "like", "TEST-%").order("name"),
    admin.from("staff_duties").select("staff_id, duty"),
    admin.from("stores").select("id, name"),
  ]);
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const staffOpts = (staff ?? []).map((s) => ({ id: s.id, name: s.name, store: storeName.get(s.store_id ?? "") ?? "未所属" }));
  const leaders = (staff ?? []).filter((s) => s.permission === "admin" || s.permission === "superadmin" || s.permission === "store");
  const dutiesOf = (id: string) => (staffDuties ?? []).filter((d) => d.staff_id === id).map((d) => DUTY_LABELS[d.duty as keyof typeof DUTY_LABELS] ?? d.duty);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">権限付与</h1>
        <p className="mt-1 text-sm text-slate-500">
          権限は「立場（見られる範囲）」「担当（入力・承認できる仕事）」「機能（モジュール）」の3つで決まります。機能は、組織図の「階層」でも割り当てられます。
          {editable ? "" : "変えられるのは「システム」の担当か代表だけです（見ることはできます）。"}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800">機能（モジュール）の割り当て</h2>
        {(modules ?? []).map((m) => (
          <article key={m.key} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-900">{m.label}</h3>
            <p className="mb-3 text-sm text-slate-500">{m.description}</p>
            <GrantForm
              ranks={Object.entries(RANK_GRANT_LABELS).map(([key, label]) => ({ key, label }))}
              positions={Object.entries(POSITION_LABELS).map(([key, label]) => ({ key, label }))}
              duties={(duties ?? []).map((d) => ({ key: d.key, label: d.label }))}
              staff={staffOpts}
              granted={(grants ?? []).filter((g) => g.module === m.key).map((g) => `${g.grantee_type}:${g.grantee}`)}
              editable={editable}
              action={saveModuleGrants.bind(null, m.key)}
            />
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800">担当ごとにできること</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(duties ?? []).map((d) => (
            <div key={d.key} className="rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <p className="font-bold text-slate-900">{d.label}</p>
              <p className="mt-1 text-slate-600">{d.description}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">経理（入力）と経理（承認）は同じ人が持てません。代表は見るだけで、給与の確定・報告の承認・権限の割り当てだけができます。</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800">店長・管理者の立場と担当</h2>
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">名前</th>
                <th className="px-4 py-2.5 font-medium">所属</th>
                <th className="px-4 py-2.5 font-medium">立場</th>
                <th className="px-4 py-2.5 font-medium">担当</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaders.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/staff/${s.id}`} className="font-bold text-brand hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{storeName.get(s.store_id ?? "") ?? "—"}</td>
                  <td className="px-4 py-2.5">{permissionLabel(s.permission)}</td>
                  <td className="px-4 py-2.5">{dutiesOf(s.id).join("・") || <span className="text-amber-700">なし（見るだけ）</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">立場と担当は、名前を押して開くスタッフの画面の「立場と担当」で変えます（自分のものは変えられません）。</p>
      </section>
    </div>
  );
}
