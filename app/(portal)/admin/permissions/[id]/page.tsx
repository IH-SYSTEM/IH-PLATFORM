import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { canAssign } from "@/lib/duties";
import { moduleStatesFor } from "@/lib/modules";
import { LEVEL_LABELS, loadOrg } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { DutyPanel } from "../../staff/duty-panel";
import { saveRoleAndDuties } from "../../staff/duty-actions";
import { setPersonModule } from "../actions";
import { ModuleToggles } from "./module-toggles";

export const metadata = { title: "権限付与" };

/** 1人分の権限：立場と担当、使える機能（自動で付くものと、この人だけの設定） */
export default async function PersonPermissionPage({ params }: PageProps<"/admin/permissions/[id]">) {
  const me = await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: staff }, { data: allDuties }, { data: myDuties }, { data: modules }, org] = await Promise.all([
    admin.from("staff").select("id, name, permission, store_id, retired").eq("id", id).maybeSingle(),
    admin.from("duties").select("key, label, description, exclusive_with").order("sort_order"),
    admin.from("staff_duties").select("duty").eq("staff_id", id),
    admin.from("modules").select("key, label, description").order("sort_order"),
    loadOrg(),
  ]);
  if (!staff) notFound();
  const { data: store } = staff.store_id ? await admin.from("stores").select("name").eq("id", staff.store_id).maybeSingle() : { data: null };
  const duties = (myDuties ?? []).map((d) => d.duty);
  const states = await moduleStatesFor({ id: staff.id, permission: staff.permission, duties });
  const self = staff.id === me.id;
  const editable = canAssign(me) && !self;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/admin/permissions" className="text-sm text-slate-500 hover:text-slate-800">
          ← 権限付与
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{staff.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {store?.name ?? "未所属"}・階層：{LEVEL_LABELS[org.levelOf(staff.id)] ?? "—"}
          <Link href={`/admin/staff/${staff.id}`} className="ml-3 text-brand hover:underline">
            スタッフ情報
          </Link>
        </p>
        {self && <p className="mt-2 text-sm text-amber-700">自分の権限は変えられません。ほかのシステム担当か代表に頼んでください</p>}
      </div>

      <DutyPanel
        permission={staff.permission ?? "member"}
        duties={duties}
        all={allDuties ?? []}
        action={saveRoleAndDuties.bind(null, staff.id)}
        editable={editable}
        reason={self ? "自分の立場と担当は変えられません" : "変えられるのは「システム」の担当か代表だけです"}
        canGrantSuperadmin={me.permission === "superadmin"}
      />

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">使える機能</h2>
        <p className="mt-0.5 text-xs text-slate-500">はじめの設定（階層・立場・担当）で自動で付くものに加えて、この人だけ付けたり外したりできます</p>
        <ModuleToggles
          rows={(modules ?? []).map((m) => ({ key: m.key, label: m.label, description: m.description, ...states[m.key] }))}
          editable={editable}
          set={setPersonModule.bind(null, staff.id)}
        />
      </section>
    </div>
  );
}
