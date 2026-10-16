import { requireStaff } from "@/lib/auth";
import type { FileRow } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileList } from "@/app/files/file-list";

export const metadata = { title: "書類" };

const ymd = (d: string) => `${d.slice(0, 4)}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// 自分の書類（雇用契約書・源泉徴収票など、会社が本人向けに公開したもの）と、会社の規程（就業規則など、全員に公開したもの）
export default async function MyDocumentsPage() {
  const me = await requireStaff();
  const admin = createAdminClient();
  const [{ data: files }, { data: rules }] = await Promise.all([
    admin
      .from("files")
      .select("*")
      .eq("owner_staff_id", me.id)
      .eq("status", "ready")
      .eq("visible_to_owner", true)
      .order("created_at", { ascending: false })
      .returns<FileRow[]>(),
    admin
      .from("files")
      .select("id, name, doc_kind, doc_date, created_at")
      .eq("public_to_staff", true)
      .eq("status", "ready")
      .not("owner_company_id", "is", null)
      .order("doc_kind")
      .order("doc_date", { ascending: false, nullsFirst: false }),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">書類</h1>

      <section className="space-y-2">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">会社の規程</h2>
        <p className="text-sm text-slate-500">就業規則など、会社の決まりです。いつでもここから見られます</p>
        <div className="rounded-md border border-line bg-white px-4 py-2">
          {rules?.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {rules.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-bold text-brand hover:underline">
                    {f.doc_kind ?? f.name}
                  </a>
                  {f.doc_date && <span className="text-xs text-slate-400">{ymd(f.doc_date)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-slate-400">まだありません</p>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">自分の書類</h2>
        <p className="text-sm text-slate-500">雇用契約書・労働条件通知書・源泉徴収票など、会社から受け取った書類です</p>
        <div className="rounded-md border border-line bg-white px-4 py-2">
          <FileList files={files ?? []} />
        </div>
      </section>
    </div>
  );
}
