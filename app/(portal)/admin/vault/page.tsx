import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { VAULT_CATEGORIES, canUseVault, formatBytes, type FileRow } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { ResummarizeButton, VaultDeleteButton, VaultUploader } from "./vault-uploader";

export const metadata = { title: "会社の書類" };
// 書類を入れたあとに AI が読む（返事のあとで動く）ので、長めに待てるようにする
export const maxDuration = 300;

const ymd = (d: string) => `${d.slice(0, 4)}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/**
 * 会社の書類の保管庫（2026-10-13）。定款・決算書・登記簿・契約書など。会社ごと・種類ごとに並べる。
 * 経理・総務の担当（と代表）だけが見る・入れる・消すことができ、開いた記録は操作ログに残る
 */
export default async function VaultPage({ searchParams }: PageProps<"/admin/vault">) {
  const me = await requireAdmin();
  if (!canUseVault(me)) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900">会社の書類</h1>
        <p className="mt-3 text-sm text-slate-600">会社の書類は、経理・総務の担当だけが見られます</p>
      </div>
    );
  }
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: companies } = await admin.from("companies").select("id, name").eq("is_active", true).order("sort_order");
  const list = companies ?? [];
  const companyId = typeof sp.company === "string" && list.some((c) => c.id === sp.company) ? sp.company : (list[0]?.id ?? "");
  const { data: files } = await admin
    .from("files")
    .select("*")
    .eq("owner_company_id", companyId)
    .eq("status", "ready")
    .order("doc_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .returns<FileRow[]>();
  const [{ data: names }, { data: history }] = await Promise.all([
    admin.from("staff").select("id, name").in("id", [...new Set((files ?? []).map((f) => f.uploaded_by))]),
    admin.from("company_history").select("history, updated_at").eq("company_id", companyId).maybeSingle(),
  ]);
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.name]));
  const categories = Object.entries(VAULT_CATEGORIES).map(([value, c]) => ({ value, label: c.label }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">会社の書類</h1>
        <p className="mt-1 text-sm text-slate-500">定款・決算書・登記簿・契約書など。見られるのは経理・総務の担当と代表だけで、開いた記録は残ります。入れた書類は AI が読んで要約し、会社の沿革をまとめ直して、代表の壁打ちで使います</p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {list.map((c) => (
          <Link
            key={c.id}
            href={`/admin/vault?company=${c.id}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold ${c.id === companyId ? "border-brand text-brand" : "border-transparent text-slate-500"}`}
          >
            {c.name.replace("株式会社", "")}
          </Link>
        ))}
      </nav>

      <VaultUploader key={companyId} companies={list} categories={categories} companyId={companyId} />

      {history && (
        <details className="rounded-md border border-brand/30 bg-brand-soft p-4 text-sm">
          <summary className="cursor-pointer font-bold text-slate-800">
            AI がまとめた沿革といまの要点
            <span className="ml-2 text-xs font-normal text-slate-500">{new Date(history.updated_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} 時点・壁打ちで使います</span>
          </summary>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-slate-700">{history.history}</p>
        </details>
      )}

      {categories.map((cat) => {
        const rows = (files ?? []).filter((f) => f.category === cat.value);
        if (!rows.length) return null;
        return (
          <section key={cat.value} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">
              {cat.label}
              <span className="ml-2 text-xs font-normal text-slate-400">{rows.length}件</span>
            </h2>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {rows.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  {f.doc_date && <span className="w-24 tabular-nums text-slate-500">{ymd(f.doc_date)}</span>}
                  <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-brand hover:underline">
                    {f.name}
                  </a>
                  {f.note && <span className="text-xs text-slate-600">{f.note}</span>}
                  <span className="text-xs text-slate-400">
                    {formatBytes(f.size_bytes)}・{nameOf.get(f.uploaded_by) ?? "—"}・{new Date(f.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </span>
                  <VaultDeleteButton fileId={f.id} name={f.name} />
                  <div className="w-full">
                    {f.ai_summary ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-slate-500">AI が読んだ要約</summary>
                        <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-slate-700">{f.ai_summary}</p>
                      </details>
                    ) : f.ai_error ? (
                      <p className="text-xs text-amber-700">
                        {f.ai_error} <ResummarizeButton fileId={f.id} />
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">AI が読んでいます（1〜2分。再読み込みで出ます）</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!(files ?? []).length && <p className="text-sm text-slate-400">この会社の書類はまだありません</p>}
    </div>
  );
}
