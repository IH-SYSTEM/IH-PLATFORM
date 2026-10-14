import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { contentBlock, summarizeVaultFile, type VaultFile } from "@/lib/ai-guide/vault-ai";
import { BUCKET, VAULT_CATEGORIES } from "@/lib/files";
import { parseAirRegi, parseAirRegiDaily } from "@/lib/pos/airregi";
import { airRegiKind } from "@/lib/pos/import-airregi";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTableType, readTable, toDate, toNumber, type Table } from "./table";

/**
 * 利用データ保管庫の取り込み（2026-10-14 黒田さん「何でも入れて、中を見て分析してデータとして格納」）。
 * 入れたファイルごとに「データセット」を1つ作る：
 *   ・エアレジの CSV（会計明細・売上集計）… 日ごとの売上・客数に起こす。どの店かを人が選んで「売上に取り込む」（公式の数字）
 *   ・そのほかの表（CSV・Excel）… AI が列の意味・カテゴリ・会社・日付の列を決め、全行をデータとして貯める
 *   ・書類（PDF・写真）… AI が読んで振り分け・要約（会社の書類と同じ）。決算書なら決算の数字を読み取り、人が確かめてから公式に
 * 中身はプログラムで正確に読み、AI には見出しと最初の数十行だけを見せる（大きな表でも速く・安く・正確に）
 */
const client = new Anthropic();
const MODEL = "claude-opus-5-5";
const MAX_ROWS = 50_000;

type Col = { key: string; label: string; type: "text" | "number" | "money" | "date"; unit?: string };

const textOf = (res: Anthropic.Beta.BetaMessage) =>
  res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();

function parseJson<T>(text: string): T | null {
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try {
    return JSON.parse(text.slice(i, j + 1)) as T;
  } catch {
    return null;
  }
}

async function askJson<T>(content: Anthropic.Beta.BetaContentBlockParam[], maxTokens = 4000): Promise<T | null> {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    messages: [{ role: "user", content }],
  });
  return parseJson<T>(textOf(res));
}

/** カテゴリを名前で探し、なければ作る（整理でまとめられていれば、まとめた先を使う） */
export async function categoryId(name: string, description?: string | null): Promise<string | null> {
  const n = name.trim().slice(0, 60);
  if (!n) return null;
  const admin = createAdminClient();
  const { data: found } = await admin.from("data_categories").select("id, merged_into").eq("name", n).maybeSingle();
  if (found) return found.merged_into ?? found.id;
  const { data: made } = await admin.from("data_categories").insert({ name: n, description: description?.slice(0, 500) ?? null }).select("id").single();
  if (made) return made.id;
  const { data: again } = await admin.from("data_categories").select("id").eq("name", n).maybeSingle();
  return again?.id ?? null;
}

/** 月ごとの合計（日付の列があり、数字の列があるとき）。壁打ちですぐ使えるように */
function monthlyStats(rows: { row_date: string | null; data: Record<string, unknown> }[], cols: Col[]) {
  const nums = cols.filter((c) => c.type === "number" || c.type === "money");
  if (!nums.length || !rows.some((r) => r.row_date)) return null;
  const by: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!r.row_date) continue;
    const m = r.row_date.slice(0, 7);
    by[m] ??= { 行数: 0 };
    by[m]["行数"] += 1;
    for (const c of nums) {
      const v = r.data[c.label];
      if (typeof v === "number") by[m][c.label] = (by[m][c.label] ?? 0) + v;
    }
  }
  return { monthly: by };
}

async function saveRows(datasetId: string, rows: { row_date: string | null; data: Record<string, unknown> }[]) {
  const admin = createAdminClient();
  await admin.from("dataset_rows").delete().eq("dataset_id", datasetId);
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await admin.from("dataset_rows").insert(rows.slice(i, i + 1000).map((r, j) => ({ dataset_id: datasetId, row_index: i + j, row_date: r.row_date, data: r.data })));
    if (error) throw new Error(`行を保存できませんでした（${error.message}）`);
  }
}

const periodOf = (rows: { row_date: string | null }[]) => {
  const ds = rows.map((r) => r.row_date).filter(Boolean) as string[];
  return ds.length ? { period_from: ds.reduce((a, b) => (a < b ? a : b)), period_to: ds.reduce((a, b) => (a > b ? a : b)) } : { period_from: null, period_to: null };
};

type FileRow = VaultFile & { ai_auto_company: boolean };

/** エアレジの CSV：日ごとの売上・客数に起こし、どの店かを人に選んでもらう */
async function ingestAirRegi(f: FileRow, datasetId: string, text: string, kind: "detail" | "daily") {
  const admin = createAdminClient();
  const receipts = kind === "detail" ? parseAirRegi(text).receipts : parseAirRegiDaily(text, "x").receipts;
  const by = new Map<string, { 売上: number; 客数: number; 会計数: number }>();
  for (const r of receipts) {
    const d = by.get(r.businessDate) ?? { 売上: 0, 客数: 0, 会計数: 0 };
    d.売上 += r.total;
    d.客数 += r.people;
    d.会計数 += kind === "detail" ? 1 : Number(r.slip.replace(/\D/g, "")) || 0;
    by.set(r.businessDate, d);
  }
  const rows = [...by].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ row_date: date, data: { 日付: date, ...v } }));
  const schema: Col[] = [
    { key: "date", label: "日付", type: "date" },
    { key: "sales", label: "売上", type: "money", unit: "円（税込）" },
    { key: "people", label: "客数", type: "number", unit: "人" },
    { key: "count", label: "会計数", type: "number", unit: "件" },
  ];
  await saveRows(datasetId, rows);
  const p = periodOf(rows);
  const total = rows.reduce((a, r) => a + (r.data.売上 as number), 0);
  const title = `エアレジ ${kind === "detail" ? "会計明細" : "売上集計"}（${p.period_from ?? ""}〜${p.period_to ?? ""}）`;
  const description = `エアレジの${kind === "detail" ? "会計明細（会計ごと）" : "売上集計（日ごとの合計）"}。${rows.length}日分・売上 ${total.toLocaleString()}円。どの店のものかはファイルからは分からないので、店を選んで「売上に取り込む」を押すと、公式の売上に入ります。`;
  await admin
    .from("datasets")
    .update({
      kind: "pos_airregi",
      category_id: await categoryId("店舗の売上（レジ）", "各店のレジ（エアレジ・FUNFO など）の日ごとの売上・客数"),
      title,
      description,
      schema,
      row_count: rows.length,
      ...p,
      stats: monthlyStats(rows, schema),
      status: "needs_review",
      review_reason: "どの店の CSV かを選んで「売上に取り込む」を押してください",
      official: "pos",
      official_status: "pending",
    })
    .eq("id", datasetId);
  await admin.from("files").update({ category: "corp_data", doc_kind: "エアレジの売上", ai_summary: description, ai_error: null, ai_summarized_at: new Date().toISOString(), doc_date: p.period_to }).eq("id", f.id);
}

/** そのほかの表：AI が見出しと最初の行を見て、列の意味・カテゴリ・会社・日付の列を決める。全行はプログラムで読む */
async function ingestTable(f: FileRow, datasetId: string, t: Table) {
  const admin = createAdminClient();
  const [{ data: cats }, { data: companies }, { data: stores }] = await Promise.all([
    admin.from("data_categories").select("name, description").is("merged_into", null).order("name"),
    admin.from("companies").select("id, name").eq("is_active", true),
    admin.from("stores").select("id, name, code").eq("is_active", true),
  ]);
  const sample = [t.header, ...t.rows.slice(0, 30)].map((r) => r.join("\t")).join("\n");
  type Plan = {
    category: string;
    category_description?: string;
    title: string;
    description: string;
    company?: string;
    store?: string;
    date_column?: number | null;
    columns: { index: number; label: string; type: Col["type"]; unit?: string }[];
  };
  const plan = await askJson<Plan>([
    {
      type: "text",
      text: `一鴻グループ（飲食店・美容室・AI事業などの会社）の利用データ保管庫に入った表です。ファイル名：「${f.name}」${t.sheet ? `（シート：${t.sheet}）` : ""}、全${t.rows.length}行。
グループの会社：${(companies ?? []).map((c) => c.name).join("、")}
店・事業：${(stores ?? []).map((s) => `${s.name}（${s.code}）`).join("、")}
今あるカテゴリ：${(cats ?? []).map((c) => `${c.name}${c.description ? `（${c.description}）` : ""}`).join("、") || "（まだない）"}

見出しと最初の行（タブ区切り）：
${sample}

次の JSON だけを返してください（前後に文を付けない）。
{"category": "データのカテゴリ。今あるカテゴリに合うものがあればその名前をそのまま。なければ新しい名前（例：仕入れ、予約、口コミ、人件費、売上（商品別））。20字まで",
 "category_description": "新しく作るときだけ、カテゴリの説明（60字まで）",
 "title": "このデータの名前（何の・いつの、30字まで）",
 "description": "経営者向けの説明：何のデータか、数字の意味（税込か・単位）、見て分かる傾向や気づき（推測はしない）。300字まで",
 "company": "どの会社のデータか（上の会社名をそのまま。分からなければ「不明」）",
 "store": "特定の店・事業のデータなら、そのコード（分からなければ「不明」）",
 "date_column": 各行の日付を表す列の番号（0から。なければ null）,
 "columns": [{"index": 列の番号（0から）, "label": "分かりやすい列名", "type": "text か number か money か date", "unit": "単位（円・人・個など。なければ空）"}]}
columns は意味のある列すべて（空の列・合計だけの列は除く）。`,
    },
  ]);
  if (!plan?.columns?.length) throw new Error("AI が表の形を読み取れませんでした");
  const cols: (Col & { index: number })[] = plan.columns
    .filter((c) => Number.isInteger(c.index) && c.index >= 0 && c.index < t.header.length)
    .map((c) => ({ key: String(c.index), index: c.index, label: c.label.slice(0, 40), type: ["number", "money", "date"].includes(c.type) ? c.type : "text", unit: c.unit || undefined }));
  const dateCol = Number.isInteger(plan.date_column) ? (plan.date_column as number) : null;
  const rows = t.rows.slice(0, MAX_ROWS).map((r) => {
    const data: Record<string, unknown> = {};
    for (const c of cols) {
      const v = (r[c.index] ?? "").trim();
      if (!v) continue;
      data[c.label] = c.type === "number" || c.type === "money" ? (toNumber(v) ?? v) : c.type === "date" ? (toDate(v) ?? v) : v;
    }
    return { row_date: dateCol !== null ? toDate(r[dateCol] ?? "") : null, data };
  });
  await saveRows(datasetId, rows);
  const company = (companies ?? []).find((c) => c.name === plan.company);
  const store = (stores ?? []).find((s) => s.code === plan.store);
  const schema: Col[] = cols.map(({ key, label, type, unit }) => ({ key, label, type, unit }));
  const p = periodOf(rows);
  await admin
    .from("datasets")
    .update({
      kind: "table",
      category_id: await categoryId(plan.category || "その他のデータ", plan.category_description),
      title: (plan.title || f.name).slice(0, 200),
      description: `${plan.description ?? ""}${t.rows.length > MAX_ROWS ? `（行が多いため、最初の${MAX_ROWS.toLocaleString()}行を貯めています）` : ""}`,
      schema,
      company_id: company?.id ?? null,
      store_id: store?.id ?? null,
      row_count: rows.length,
      ...p,
      stats: monthlyStats(rows, schema),
      status: "ready",
    })
    .eq("id", datasetId);
  await admin
    .from("files")
    .update({
      category: "corp_data",
      doc_kind: (plan.category || "データ").slice(0, 60),
      ai_summary: plan.description ?? null,
      ai_error: null,
      ai_summarized_at: new Date().toISOString(),
      doc_date: p.period_to,
      ...(f.ai_auto_company && company ? { owner_company_id: company.id } : {}),
    })
    .eq("id", f.id);
}

/** 決算書から決算の数字を読み取る（人が確かめるまでは公式にしない） */
async function extractFinancials(f: VaultFile, datasetId: string) {
  const block = await contentBlock(f);
  if ("error" in block) return;
  type Fin = { fiscal_label?: string; period_end?: string; revenue?: number; gross_profit?: number; operating_income?: number; ordinary_income?: number; net_income?: number; total_assets?: number; net_assets?: number; borrowings?: number; cash?: number };
  const fin = await askJson<Fin>([
    block,
    {
      type: "text",
      text: `この決算書から、次の数字を「円」の単位で読み取り、JSON だけを返してください（前後に文を付けない）。書類にない数字は null。千円・百万円の表示なら円に直す。
{"fiscal_label": "第◯期 など", "period_end": "決算期末 YYYY-MM-DD", "revenue": 売上高, "gross_profit": 売上総利益, "operating_income": 営業利益, "ordinary_income": 経常利益, "net_income": 当期純利益, "total_assets": 総資産（資産の部合計）, "net_assets": 純資産, "borrowings": 借入金の合計（短期＋長期）, "cash": 現金及び預金}`,
    },
  ]);
  if (!fin?.period_end || !/^\d{4}-\d{2}-\d{2}$/.test(fin.period_end)) return;
  const admin = createAdminClient();
  const { data: file } = await admin.from("files").select("owner_company_id").eq("id", f.id).single();
  if (!file?.owner_company_id) return;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
  const values = {
    revenue: n(fin.revenue),
    gross_profit: n(fin.gross_profit),
    operating_income: n(fin.operating_income),
    ordinary_income: n(fin.ordinary_income),
    net_income: n(fin.net_income),
    total_assets: n(fin.total_assets),
    net_assets: n(fin.net_assets),
    borrowings: n(fin.borrowings),
    cash: n(fin.cash),
  };
  // もう人が確かめた期の数字は、上書きしない
  const { data: existing } = await admin.from("financial_statements").select("approved").eq("company_id", file.owner_company_id).eq("period_end", fin.period_end).maybeSingle();
  if (!existing?.approved) {
    await admin.from("financial_statements").upsert({ company_id: file.owner_company_id, period_end: fin.period_end, fiscal_label: fin.fiscal_label?.slice(0, 40) ?? null, ...values, dataset_id: datasetId, approved: false }, { onConflict: "company_id,period_end" });
  }
  const labels: Record<string, string> = { revenue: "売上高", gross_profit: "売上総利益", operating_income: "営業利益", ordinary_income: "経常利益", net_income: "当期純利益", total_assets: "総資産", net_assets: "純資産", borrowings: "借入金", cash: "現金及び預金" };
  await saveRows(datasetId, [{ row_date: fin.period_end, data: { 決算期末: fin.period_end, 期: fin.fiscal_label ?? "", ...Object.fromEntries(Object.entries(values).map(([k, v]) => [labels[k], v])) } }]);
  await admin
    .from("datasets")
    .update({
      kind: "financials",
      category_id: await categoryId("決算", "決算書から読み取った各期の売上・利益・財産の数字"),
      schema: [{ key: "period_end", label: "決算期末", type: "date" }, ...Object.values(labels).map((l) => ({ key: l, label: l, type: "money", unit: "円" }))],
      row_count: 1,
      period_from: fin.period_end,
      period_to: fin.period_end,
      status: existing?.approved ? "ready" : "needs_review",
      review_reason: existing?.approved ? null : "AI が読み取った決算の数字を確かめて「これでいい」を押してください",
      official: "financials",
      official_status: existing?.approved ? "applied" : "pending",
    })
    .eq("id", datasetId);
}

/** 1つのファイルを取り込む（入れたあとに、返事を待たせずに動く） */
export async function ingestFile(fileId: string) {
  const admin = createAdminClient();
  const { data: f } = await admin
    .from("files")
    .select("id, path, name, category, content_type, size_bytes, doc_date, note, owner_company_id, ai_auto_company")
    .eq("id", fileId)
    .maybeSingle<FileRow>();
  if (!f?.owner_company_id) return;
  const { data: ds } = await admin
    .from("datasets")
    .upsert({ file_id: f.id, title: f.name.slice(0, 200), status: "processing", error: null, updated_at: new Date().toISOString() }, { onConflict: "file_id" })
    .select("id")
    .single();
  if (!ds) return;
  try {
    if (isTableType(f.content_type)) {
      const { data: blob, error } = await admin.storage.from(BUCKET).download(f.path);
      if (error || !blob) throw new Error("ファイルを読み出せませんでした");
      const buf = Buffer.from(await blob.arrayBuffer());
      if (f.content_type === "text/csv") {
        const sjis = new TextDecoder("shift_jis").decode(buf);
        const kind = airRegiKind(sjis);
        if (kind) return await ingestAirRegi(f, ds.id, sjis, kind);
      }
      const t = await readTable(buf, f.content_type);
      if ("error" in t) throw new Error(t.error);
      return await ingestTable(f, ds.id, t);
    }
    // 書類：AI が読んで振り分け・要約（会社の書類と同じ）。決算書なら決算の数字も
    await summarizeVaultFile(f.id);
    const { data: after } = await admin.from("files").select("category, doc_kind, ai_summary, ai_error, doc_date, owner_company_id").eq("id", f.id).single();
    await admin
      .from("datasets")
      .update({
        kind: "document",
        category_id: await categoryId(VAULT_CATEGORIES[after?.category as keyof typeof VAULT_CATEGORIES]?.label ?? "書類", "会社の書類（AI が読んだ要約）"),
        title: (after?.doc_kind ?? f.name).slice(0, 200),
        description: after?.ai_summary ?? after?.ai_error ?? null,
        company_id: after?.owner_company_id ?? null,
        period_from: after?.doc_date ?? null,
        period_to: after?.doc_date ?? null,
        status: after?.ai_summary ? "ready" : "error",
        error: after?.ai_summary ? null : (after?.ai_error ?? "読めませんでした"),
      })
      .eq("id", ds.id);
    if (after?.category === "corp_financials" && after.ai_summary) await extractFinancials({ ...f, owner_company_id: after.owner_company_id ?? f.owner_company_id }, ds.id);
  } catch (e) {
    console.error("ingestFile failed", fileId, e);
    await admin.from("datasets").update({ status: "error", error: e instanceof Error ? e.message : "取り込めませんでした" }).eq("id", ds.id);
    await admin.from("files").update({ ai_error: e instanceof Error ? e.message : "取り込めませんでした", ai_summarized_at: new Date().toISOString() }).eq("id", f.id);
  }
}
