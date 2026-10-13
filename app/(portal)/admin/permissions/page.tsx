import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { DUTY_LABELS, canAssign } from "@/lib/duties";
import { POSITION_LABELS, RANK_GRANT_LABELS } from "@/lib/modules";
import { LEVEL_LABELS, loadOrg } from "@/lib/org";
import { permissionLabel } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveModuleGrants } from "./actions";
import { GrantForm } from "./grant-form";

export const metadata = { title: "権限付与" };

/**
 * 権限付与（人ごと。2026-10-13 黒田さん指摘で作り直し）。人を選んで、その人の立場・担当・機能を決める。
 * 下に、機能が自動で付く「はじめの設定」（階層・立場・担当）
 */
export default async function PermissionsPage({ searchParams }: PageProps<"/admin/permissions">) {
  const me = await requireAdmin();
  const editable = canAssign(me);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const storeFilter = typeof sp.store === "string" ? sp.store : "";
  const admin = createAdminClient();
  const [{ data: staff }, { data: stores }, { data: staffDuties }, { data: modules }, { data: grants }, { data: overrides }, { data: duties }, org] = await Promise.all([
    admin.from("staff").select("id, name, furigana, permission, store_id").eq("retired", false).not("name", "like", "TEST-%").order("furigana", { nullsFirst: false }),
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("staff_duties").select("staff_id, duty"),
    admin.from("modules").select("key, label, description").order("sort_order"),
    admin.from("module_grants").select("module, grantee_type, grantee"),
    admin.from("staff_module_overrides").select("staff_id, module, allowed"),
    admin.from("duties").select("key, label").order("sort_order"),
    loadOrg(),
  ]);
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const dutiesOf = (id: string) =>
    id === process.env.CEO_STAFF_ID ? ["すべて（代表）"] : (staffDuties ?? []).filter((d) => d.staff_id === id).map((d) => DUTY_LABELS[d.duty as keyof typeof DUTY_LABELS] ?? d.duty);
  const rows = (staff ?? []).filter((s) => (!q || s.name.includes(q) || (s.furigana ?? "").includes(q)) && (!storeFilter || s.store_id === storeFilter));
  // 一覧で見せる「使える機能」（自動＋人ごとの設定）
  const modulesOf = (s: { id: string; permission: string | null }) => {
    const level = org.levelOf(s.id);
    const pos = s.permission === "superadmin" ? "admin" : (s.permission ?? "member");
    const myDuties = (staffDuties ?? []).filter((d) => d.staff_id === s.id).map((d) => d.duty);
    const isAdminPos = s.permission === "admin" || s.permission === "superadmin";
    return (modules ?? []).filter((m) => {
      const ov = (overrides ?? []).find((o) => o.staff_id === s.id && o.module === m.key);
      if (ov) return ov.allowed;
      return (grants ?? []).some(
        (g) =>
          g.module === m.key &&
          ((g.grantee_type === "rank" && level >= Number(g.grantee)) ||
            (g.grantee_type === "position" && g.grantee === pos) ||
            (g.grantee_type === "duty" && isAdminPos && myDuties.includes(g.grantee))),
      );
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">権限付与</h1>
        <p className="mt-1 text-sm text-slate-500">人を選んで、その人の立場・担当・使える機能を決めます。{editable ? "" : "変えられるのは「システム」の担当か代表だけです（見ることはできます）。"}</p>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="名前・ふりがなで探す" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select name="store" defaultValue={storeFilter} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">すべての所属</option>
          {(stores ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">探す</button>
      </form>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">名前</th>
              <th className="px-4 py-2.5 font-medium">所属</th>
              <th className="px-4 py-2.5 font-medium">階層</th>
              <th className="px-4 py-2.5 font-medium">立場</th>
              <th className="px-4 py-2.5 font-medium">担当</th>
              <th className="px-4 py-2.5 font-medium">使える機能</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/permissions/${s.id}`} className="font-bold text-brand hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{storeName.get(s.store_id ?? "") ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{LEVEL_LABELS[org.levelOf(s.id)] ?? "—"}</td>
                <td className="px-4 py-2.5">{permissionLabel(s.permission)}</td>
                <td className="px-4 py-2.5">{dutiesOf(s.id).join("・") || "—"}</td>
                <td className="px-4 py-2.5">{modulesOf(s).map((m) => m.label).join("・") || "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  見つかりません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer font-bold text-slate-800">機能のはじめの設定（自動で付く人）</summary>
        <p className="mt-2 text-sm text-slate-500">ここで選んだ階層・立場・担当の人には、機能が自動で付きます。人ごとに付けた・外した設定があれば、そちらが優先されます。</p>
        <div className="mt-4 space-y-5">
          {(modules ?? []).map((m) => (
            <article key={m.key}>
              <h3 className="font-bold text-slate-900">{m.label}</h3>
              <p className="mb-3 text-sm text-slate-500">{m.description}</p>
              <GrantForm
                ranks={Object.entries(RANK_GRANT_LABELS).map(([key, label]) => ({ key, label }))}
                positions={Object.entries(POSITION_LABELS).map(([key, label]) => ({ key, label }))}
                duties={(duties ?? []).map((d) => ({ key: d.key, label: d.label }))}
                granted={(grants ?? []).filter((g) => g.module === m.key).map((g) => `${g.grantee_type}:${g.grantee}`)}
                editable={editable}
                action={saveModuleGrants.bind(null, m.key)}
              />
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}
