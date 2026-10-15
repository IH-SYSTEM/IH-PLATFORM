import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  VAULT_CATEGORIES,
  canUseVault,
  formatBytes,
  type FileRow,
} from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataPanels } from "./data-panels";
import {
  FixForm,
  ResummarizeButton,
  VaultDeleteButton,
  VaultUploader,
} from "./vault-uploader";

export const metadata = { title: "データ保管庫" };
// 書類を入れたあとに AI が読む（返事のあとで動く）ので、長めに待てるようにする
export const maxDuration = 300;

const ymd = (d: string) =>
  `${d.slice(0, 4)}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/**
 * 会社の書類の保管庫（2026-10-13）。定款・決算書・登記簿・契約書など。会社ごと・種類ごとに並べる。
 * 経理・総務の担当（と代表）だけが見る・入れる・消すことができ、開いた記録は操作ログに残る
 */
export default async function VaultPage({
  searchParams,
}: PageProps<"/admin/vault">) {
  const me = await requireAdmin();
  if (!canUseVault(me)) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900">会社の書類</h1>
        <p className="mt-3 text-sm text-slate-600">
          会社の書類は、経理・総務の担当だけが見られます
        </p>
      </div>
    );
  }
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: companies } = await admin
    .from("companies")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");
  const list = companies ?? [];
  const companyId =
    typeof sp.company === "string" && list.some((c) => c.id === sp.company)
      ? sp.company
      : (list[0]?.id ?? "");
  const { data: files } = await admin
    .from("files")
    .select("*")
    .eq("owner_company_id", companyId)
    .eq("status", "ready")
    .order("doc_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .returns<FileRow[]>();
  const [{ data: names }, { data: history }] = await Promise.all([
    admin
      .from("staff")
      .select("id, name")
      .in("id", [...new Set((files ?? []).map((f) => f.uploaded_by))]),
    admin
      .from("company_history")
      .select("history, updated_at")
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.name]));
  const categories = Object.entries(VAULT_CATEGORIES).map(([value, c]) => ({
    value,
    label: c.label,
  }));
  // 振り分けを確かめてほしいもの（全社。AI が読んでいる途中・会社を判断できなかった・読めなかった）
  const { data: pending } = await admin
    .from("files")
    .select(
      "id, name, owner_company_id, category, doc_kind, doc_date, note, ai_error, ai_summarized_at",
    )
    .not("owner_company_id", "is", null)
    .eq("status", "ready")
    .or("ai_summarized_at.is.null,ai_error.not.is.null")
    .order("created_at", { ascending: false })
    .limit(200);
  const reading = (pending ?? []).filter((f) => !f.ai_summarized_at);
  const needsCheck = (pending ?? []).filter(
    (f) => f.ai_summarized_at && f.ai_error,
  );
  // 同じ書類（doc_kind）の版をまとめ、日付の新しいものを「最新」に
  const latestId = new Map<string, string>();
  for (const f of files ?? []) {
    const k = `${f.category}:${f.doc_kind ?? f.id}`;
    if (!latestId.has(k)) latestId.set(k, f.id); // files は日付の新しい順
  }
  const versions = (f: FileRow) =>
    (files ?? []).filter(
      (x) =>
        x.category === f.category && x.doc_kind && x.doc_kind === f.doc_kind,
    ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">データ保管庫</h1>
        <p className="mt-1 text-sm text-slate-500">
          売上・仕入れ・決算書・定款・契約書など、何でも入れてください。AI が中身を読んで振り分け、表のデータは「データ」として貯め、書類は要約して会社の沿革をまとめます。代表の壁打ちで使います。
          見られるのは経理・総務の担当と代表だけで、開いた記録は残ります
        </p>
      </div>

      <VaultUploader companies={list} categories={categories} />

      <DataPanels />

      <h2 className="pt-2 text-lg font-bold text-slate-800">書類の原本（会社ごと）</h2>
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

      {reading.length > 0 && (
        <p className="rounded-md bg-slate-50 px-4 py-2 text-sm text-slate-600">
          AI が読んで振り分けています：{reading.length}
          件（終わると、それぞれの会社に入ります）
        </p>
      )}
      {needsCheck.length > 0 && (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <h2 className="font-bold text-amber-900">
            確かめてほしいもの（{needsCheck.length}件）
          </h2>
          <ul className="mt-2 space-y-3">
            {needsCheck.map((f) => (
              <li key={f.id}>
                <a
                  href={`/files/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  {f.name}
                </a>
                <span className="ml-2 text-xs text-amber-800">
                  {f.ai_error}
                </span>
                <span className="ml-2">
                  <ResummarizeButton fileId={f.id} />
                </span>
                <FixForm
                  file={{
                    id: f.id,
                    company: f.owner_company_id!,
                    category: f.category,
                    doc_kind: f.doc_kind,
                    doc_date: f.doc_date,
                    note: f.note,
                  }}
                  companies={list}
                  categories={categories}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {history && (
        <details className="rounded-md border border-brand/30 bg-brand-soft p-4 text-sm">
          <summary className="cursor-pointer font-bold text-slate-800">
            AI がまとめた沿革といまの要点
            <span className="ml-2 text-xs font-normal text-slate-500">
              {new Date(history.updated_at).toLocaleDateString("ja-JP", {
                timeZone: "Asia/Tokyo",
              })}{" "}
              時点・壁打ちで使います
            </span>
          </summary>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-slate-700">
            {history.history}
          </p>
        </details>
      )}

      {categories.map((cat) => {
        const rows = (files ?? []).filter((f) => f.category === cat.value);
        if (!rows.length) return null;
        return (
          <section
            key={cat.value}
            className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-sm font-bold text-slate-800">
              {cat.label}
              <span className="ml-2 text-xs font-normal text-slate-400">
                {rows.length}件
              </span>
            </h2>
            {/* 表の形でそろえる：書類の名前（最新・過去）｜日付｜ファイル｜大きさ｜入れた日 */}
            <div className="mt-2 hidden grid-cols-[minmax(0,14rem)_6.5rem_minmax(0,1fr)_4.5rem_6rem_2.5rem] gap-x-3 border-b border-slate-200 pb-1.5 text-xs text-slate-400 md:grid">
              <span>書類の名前</span>
              <span>日付</span>
              <span>ファイル</span>
              <span className="text-right">大きさ</span>
              <span>入れた日</span>
              <span />
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {[...rows]
                // 同じ書類の版を並べる（書類の名前ごと、その中は日付の新しい順）
                .sort((a, b) => (a.doc_kind ?? "~").localeCompare(b.doc_kind ?? "~", "ja") || (b.doc_date ?? "").localeCompare(a.doc_date ?? ""))
                .map((f) => {
                  const latest = latestId.get(`${f.category}:${f.doc_kind}`) === f.id;
                  return (
                    <li key={f.id} className="py-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 md:grid-cols-[minmax(0,14rem)_6.5rem_minmax(0,1fr)_4.5rem_6rem_2.5rem]">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-bold text-slate-800">{f.doc_kind ?? "（名前なし）"}</span>
                          {f.doc_kind && versions(f) > 1 && (
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${latest ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{latest ? "最新" : "過去"}</span>
                          )}
                        </span>
                        <span className="tabular-nums text-slate-500 md:order-none">{f.doc_date ? ymd(f.doc_date) : "—"}</span>
                        <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="col-span-2 min-w-0 truncate text-brand hover:underline md:col-span-1" title={f.name}>
                          {f.name}
                        </a>
                        <span className="hidden text-right text-xs tabular-nums text-slate-400 md:block">{formatBytes(f.size_bytes)}</span>
                        <span className="hidden text-xs text-slate-400 md:block" title={nameOf.get(f.uploaded_by) ?? ""}>
                          {new Date(f.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                        </span>
                        <span className="hidden text-right md:block">
                          <VaultDeleteButton fileId={f.id} name={f.name} />
                        </span>
                      </div>
                      {f.note && <p className="mt-0.5 text-xs text-slate-500">{f.note}</p>}
                      <div className="mt-1">
                        {f.ai_summary ? (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-slate-500">AI が読んだ要約・振り分けを直す</summary>
                            <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-slate-700">{f.ai_summary}</p>
                            <FixForm
                              file={{ id: f.id, company: f.owner_company_id!, category: f.category, doc_kind: f.doc_kind ?? null, doc_date: f.doc_date ?? null, note: f.note ?? null }}
                              companies={list}
                              categories={categories}
                            />
                            <div className="mt-1 md:hidden">
                              <VaultDeleteButton fileId={f.id} name={f.name} />
                            </div>
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
                  );
                })}
            </ul>
          </section>
        );
      })}
      {!(files ?? []).length && (
        <p className="text-sm text-slate-400">この会社の書類はまだありません</p>
      )}
    </div>
  );
}
