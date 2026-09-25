import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/format";
import { StoreForm, type StoreRecord } from "../store-form";
import { saveStore } from "../actions";

export default async function StoreEditPage({ params, searchParams }: PageProps<"/admin/stores/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;
  const supabase = await createClient();
  const [{ data: store }, { data: staff }] = await Promise.all([
    supabase.from("stores").select("*").eq("id", id).maybeSingle<StoreRecord>(),
    supabase.from("staff").select("id, name, role").eq("store_id", id).eq("retired", false).order("furigana"),
  ]);
  if (!store) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/admin/stores" className="text-sm text-slate-500 hover:text-slate-800">
          ← 店舗一覧
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          {store.name}
          {!store.is_active && <span className="ml-3 rounded-full bg-slate-200 px-2.5 py-1 align-middle text-xs font-medium text-slate-600">未使用</span>}
        </h1>
      </div>

      <StoreForm store={store} staff={staff ?? []} action={saveStore.bind(null, store.id)} createdNotice={created === "1"}>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">所属スタッフ（{staff?.length ?? 0}名）</h2>
        {staff && staff.length > 0 ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/staff/${s.id}`} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-indigo-400">
                  <span className="font-medium text-slate-800">{s.name}</span>
                  <span className="text-xs text-slate-500">{roleLabel(s.role)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-400">所属しているスタッフはいません</p>
        )}
      </section>
      </StoreForm>
    </div>
  );
}
