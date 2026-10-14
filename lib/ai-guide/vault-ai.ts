import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { BUCKET, VAULT_CATEGORIES } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 会社の書類を AI が読む（2026-10-13 黒田さん「AIが常に見に行けるようにして、沿革も理解し、アドバイスや分析ができる体制」）。
 * ① 書類を入れたら、AI が中身を読んで要約を残す（何の書類か・大事な数字・出来事）
 * ② その会社の要約をまとめ直して「沿革と、いまの要点」を作る
 * ③ 壁打ち（代表だけ）は、毎回この沿革と要約を前提に読む。AI取説（全員）には渡さない
 * 中身を読めるのは PDF・写真（JPEG・PNG・WebP）・CSV。Excel・Word は PDF にして入れてもらう
 */
const client = new Anthropic();
const MODEL = "claude-opus-5-5";
const MAX_READ_BYTES = 30 * 1024 * 1024; // AI に一度に渡せる大きさの目安
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type VaultFile = { id: string; path: string; name: string; category: string; content_type: string; size_bytes: number; doc_date: string | null; note: string | null; owner_company_id: string };

export async function contentBlock(f: VaultFile): Promise<Anthropic.Beta.BetaContentBlockParam | { error: string }> {
  if (f.size_bytes > MAX_READ_BYTES) return { error: "大きすぎて AI が読めません（30MBまで。ページを分けて入れてください）" };
  const isPdf = f.content_type === "application/pdf";
  const isCsv = f.content_type === "text/csv";
  if (!isPdf && !isCsv && !IMAGE_TYPES.has(f.content_type)) return { error: "この形式は AI が中身を読めません（PDF にして入れると読めます）" };
  const { data, error } = await createAdminClient().storage.from(BUCKET).download(f.path);
  if (error || !data) return { error: "ファイルを読み出せませんでした" };
  const buf = Buffer.from(await data.arrayBuffer());
  if (isCsv) return { type: "document", source: { type: "text", media_type: "text/plain", data: buf.toString("utf8").slice(0, 200_000) }, title: f.name };
  if (isPdf) return { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") }, title: f.name };
  return { type: "image", source: { type: "base64", media_type: f.content_type as "image/jpeg" | "image/png" | "image/webp", data: buf.toString("base64") } };
}

const textOf = (res: Anthropic.Beta.BetaMessage) =>
  res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();

type Classified = { company?: string; category?: string; doc_kind?: string; doc_date?: string | null; summary?: string };

/** 返事の中の JSON を取り出す（前後に文が付いても読めるように） */
function parseJson(text: string): Classified | null {
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try {
    return JSON.parse(text.slice(i, j + 1)) as Classified;
  } catch {
    return null;
  }
}

/**
 * 1つの書類を読んで、振り分け（会社・種類・書類の名前・日付）と要約を残す。読めなかったら理由を残す（保管そのものは止めない）。
 * 会社・種類を AI に任せた書類だけ、その欄を AI の答えで上書きする。終わったら、その会社の沿革をまとめ直す（まとめて入れたときは最後の1件で）
 */
export async function summarizeVaultFile(fileId: string) {
  const admin = createAdminClient();
  const { data: f } = await admin
    .from("files")
    .select("id, path, name, category, content_type, size_bytes, doc_date, note, owner_company_id, doc_kind, ai_auto_company, ai_auto_category")
    .eq("id", fileId)
    .maybeSingle<VaultFile & { doc_kind: string | null; ai_auto_company: boolean; ai_auto_category: boolean }>();
  if (!f?.owner_company_id) return;
  const { data: companies } = await admin.from("companies").select("id, name").eq("is_active", true).order("sort_order");
  const current = (companies ?? []).find((c) => c.id === f.owner_company_id);
  const block = await contentBlock(f);
  if ("error" in block) {
    await admin.from("files").update({ ai_summary: null, ai_error: block.error, ai_summarized_at: new Date().toISOString(), doc_kind: f.doc_kind ?? f.name.replace(/\.[^.]+$/, "").slice(0, 60) }).eq("id", fileId);
    await afterRead(f.owner_company_id);
    return;
  }
  const categories = Object.entries(VAULT_CATEGORIES).map(([k, v]) => `${k}（${v.label}）`).join("、");
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 5000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      messages: [
        {
          role: "user",
          content: [
            block,
            {
              type: "text",
              text: `一鴻グループの会社の書類です。ファイル名：「${f.name}」${f.ai_auto_company ? "" : `／会社：${current?.name ?? ""}`}${f.ai_auto_category ? "" : `／種類：${VAULT_CATEGORIES[f.category as keyof typeof VAULT_CATEGORIES]?.label ?? f.category}`}${f.doc_date ? `／日付：${f.doc_date}` : ""}${f.note ? `／メモ：${f.note}` : ""}
グループの会社：${(companies ?? []).map((c) => c.name).join("、")}

中身を読んで、次の JSON だけを返してください（前後に文を付けない）。
{"company": "どの会社の書類か（上の会社名をそのまま。グループ全体・判断できないときは「不明」）",
 "category": "種類のキー（${categories} のどれか1つ）",
 "doc_kind": "書類の名前（版をまとめる単位。例：定款、36協定、就業規則、決算書、法人税申告書、登記簿謄本、賃貸借契約書（◯◯店）。20字まで。期や年は入れない）",
 "doc_date": "書類の日付 YYYY-MM-DD（決算書は決算期末、定款は最終変更日、協定は有効期間の始まり、契約は契約日。分からなければ null）",
 "summary": "経営者が使える要約。何の書類か（1行）／大事な数字（書類にある数字だけ、単位と期つき。決算書なら売上高・売上総利益・営業利益・経常利益・当期純利益・純資産・総資産・借入金・現預金）／大事な事実・取り決め（目的・資本金・役員・期間・金額・条件・期限）／沿革に入れる出来事（日付つき）／気をつける点（期限・更新・リスク。なければ書かない）。推測はしない。読めない部分は「読めない」。改行は \\n。1500字まで"}`,
            },
          ],
        },
      ],
    });
    const out = parseJson(textOf(res));
    if (!out?.summary) throw new Error("JSON を読めませんでした");
    const update: Record<string, unknown> = { ai_summary: out.summary.slice(0, 6000), ai_error: null, ai_summarized_at: new Date().toISOString() };
    const company = f.ai_auto_company ? (companies ?? []).find((c) => c.name === out.company) : null;
    if (company) update.owner_company_id = company.id;
    if (f.ai_auto_category && out.category && out.category in VAULT_CATEGORIES) update.category = out.category;
    if ((f.ai_auto_category || !f.doc_kind) && out.doc_kind) update.doc_kind = out.doc_kind.slice(0, 60);
    if (!f.doc_date && out.doc_date && /^\d{4}-\d{2}-\d{2}$/.test(out.doc_date)) update.doc_date = out.doc_date;
    // 会社を判断できなかったときは「振り分け待ち」として、今の会社（仮）のままにする
    if (f.ai_auto_company && !company) update.ai_error = "どの会社の書類か判断できませんでした。「直す」で会社を選んでください";
    await admin.from("files").update(update).eq("id", fileId);
    await afterRead(f.owner_company_id, company?.id);
  } catch (e) {
    console.error("summarizeVaultFile failed", fileId, e);
    await admin.from("files").update({ ai_error: "AI が読めませんでした（あとで「読み直す」を押してください）", ai_summarized_at: new Date().toISOString() }).eq("id", fileId);
    await afterRead(f.owner_company_id);
  }
}

/** まだ読んでいない書類が残っていなければ、その会社の沿革をまとめ直す（まとめて入れたとき、何十回もまとめ直さないように） */
async function afterRead(...companyIds: (string | null | undefined)[]) {
  const admin = createAdminClient();
  for (const id of new Set(companyIds.filter(Boolean) as string[])) {
    const { count } = await admin.from("files").select("id", { count: "exact", head: true }).eq("owner_company_id", id).eq("status", "ready").is("ai_summarized_at", null);
    if (!count) await rebuildCompanyHistory(id);
  }
}

/** その会社の書類の要約から、沿革と、いまの要点をまとめ直す */
export async function rebuildCompanyHistory(companyId: string) {
  const admin = createAdminClient();
  const [{ data: company }, { data: files }] = await Promise.all([
    admin.from("companies").select("name").eq("id", companyId).maybeSingle(),
    admin.from("files").select("name, category, doc_kind, doc_date, note, ai_summary").eq("owner_company_id", companyId).eq("status", "ready").not("ai_summary", "is", null).order("doc_date", { ascending: true, nullsFirst: true }),
  ]);
  if (!files?.length) {
    await admin.from("company_history").delete().eq("company_id", companyId);
    return;
  }
  const docs = files
    .map((f) => `### ${f.doc_kind ?? VAULT_CATEGORIES[f.category as keyof typeof VAULT_CATEGORIES]?.label ?? f.category}「${f.name}」${f.doc_date ? `（${f.doc_date}）` : ""}${f.note ? `・${f.note}` : ""}\n${f.ai_summary}`)
    .join("\n\n");
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 6000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      messages: [
        {
          role: "user",
          content: `「${company?.name ?? ""}」の会社の書類の要約です。これだけをもとに、次の2つを書いてください。
1. 沿革：日付の古い順に「YYYY年M月　出来事」の形で（書類にある出来事だけ）
2. いまの要点：直近の決算の数字（期と単位つき）と前の期からの変化、財務の状態、持っている契約・許認可、近い期限や気をつける点
書類にないことは書かない。足りない書類があれば最後に「あるとよい書類」として1行で。見出しの記号（#・*）は使わず、ふつうの文と改行で。2000字まで。

${docs}`,
        },
      ],
    });
    await admin.from("company_history").upsert({ company_id: companyId, history: textOf(res).slice(0, 8000), updated_at: new Date().toISOString() });
  } catch (e) {
    console.error("rebuildCompanyHistory failed", companyId, e);
  }
}

/** 壁打ちに渡す「会社の書類から」（全社の沿革・いまの要点と、書類ごとの要約の見出し） */
export async function vaultContext(): Promise<string> {
  const admin = createAdminClient();
  const [{ data: companies }, { data: histories }, { data: files }] = await Promise.all([
    admin.from("companies").select("id, name").eq("is_active", true).order("sort_order"),
    admin.from("company_history").select("company_id, history, updated_at"),
    admin.from("files").select("owner_company_id, name, category, doc_date, ai_summary").not("owner_company_id", "is", null).eq("status", "ready").order("doc_date", { ascending: false, nullsFirst: false }).limit(200),
  ]);
  if (!files?.length) return "## 会社の書類から\n（まだ書類が入っていません。定款・決算書などは「会社の書類」に入れると、ここで読めるようになります）";
  const parts = (companies ?? []).map((c) => {
    const h = (histories ?? []).find((x) => x.company_id === c.id);
    const mine = files.filter((f) => f.owner_company_id === c.id);
    if (!h && !mine.length) return "";
    const list = mine
      .map((f) => `- ${VAULT_CATEGORIES[f.category as keyof typeof VAULT_CATEGORIES]?.label ?? f.category}「${f.name}」${f.doc_date ? `（${f.doc_date}）` : ""}${f.ai_summary ? `：${f.ai_summary.replace(/\s+/g, " ").slice(0, 600)}` : "：（AIはまだ読めていない）"}`)
      .join("\n");
    return `### ${c.name}\n${h ? `【沿革といまの要点】（${h.updated_at.slice(0, 10)} 時点）\n${h.history}\n` : ""}【書類】\n${list}`;
  });
  return `## 会社の書類から（定款・決算書など。AIが読んだ要約。数字は書類にあるものだけ）\n${parts.filter(Boolean).join("\n\n")}`;
}
