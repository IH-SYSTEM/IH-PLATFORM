import { redirect } from "next/navigation";
import { isCeo, requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";
import { saveConcept, toggleConcept } from "./actions";
import { ConceptForm } from "./concept-form";

export const metadata = { title: "コンセプト帳" };

// 壁打ちのAIが「崩さない」ように守る柱。代表だけが見て、書ける
export default async function ConceptsPage() {
  const me = await requireAdmin();
  if (!isCeo(me)) redirect("/admin");
  const { data: rows } = await createAdminClient().from("ceo_concepts").select("id, scope, title, body, is_active").order("is_active", { ascending: false }).order("sort_order").order("updated_at");

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="コンセプト帳" description="壁打ちのAIは、提案のたびにここの柱とぶつからないかを確かめます。代表だけが見られます" />
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-800">柱を足す</h2>
        <ConceptForm action={saveConcept.bind(null, null)} label="足す" />
      </section>
      <div className="space-y-3">
        {(rows ?? []).map((c) => (
          <details key={c.id} className={`rounded-md border bg-white p-4 ${c.is_active ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"}`}>
            <summary className="cursor-pointer list-none">
              <span className="mr-2 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-bold text-brand">{c.scope}</span>
              <span className="font-bold text-slate-900">{c.title}</span>
              {!c.is_active && <span className="ml-2 text-xs text-slate-400">（使っていない）</span>}
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-600">{c.body}</p>
            </summary>
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <ConceptForm action={saveConcept.bind(null, c.id)} initial={c} label="直す" />
              <form action={toggleConcept.bind(null, c.id, !c.is_active)}>
                <button className="text-xs text-slate-400 hover:text-accent">{c.is_active ? "使わない（AIに渡さない）" : "また使う"}</button>
              </form>
            </div>
          </details>
        ))}
        {!rows?.length && <p className="text-sm text-slate-400">まだありません</p>}
      </div>
    </div>
  );
}
