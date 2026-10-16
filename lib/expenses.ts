import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { BUCKET } from "@/lib/files";
import type { ApplyContext } from "@/lib/reports/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 店の経費（2026-10-16）。報告窓口の「経費の報告」を経理が承認したときに、経費のデータとして残す。
 * AI がレシートの写真を読み、お店の名前・税率・勘定科目の案を付ける。報告の金額・日付とレシートが食い違えば ai_note に書く（経理が直せる）
 */
// 勘定科目は、マネーフォワードの仕訳帳（見本）で使っている名前に合わせる（2026-10-16）
export const ACCOUNT_TITLES = [
  "材料仕入",
  "酒類仕入",
  "店舗消耗品費",
  "消耗備品費",
  "事務用品費",
  "衛生費",
  "修繕費",
  "通信費",
  "水道光熱費",
  "車両費",
  "旅費交通費",
  "支払手数料",
  "広告宣伝費",
  "接待交際費",
  "会議費",
  "福利厚生費",
  "新聞図書費",
  "荷造運賃",
  "租税公課",
  "管理諸費",
  "雑費",
] as const;

const client = new Anthropic();
const IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);

type Suggest = { vendor?: string; date?: string; amount?: number; tax_rate?: number; account_title?: string; note?: string };

async function readReceipt(fileId: string, payload: ApplyContext["payload"]): Promise<Suggest | null> {
  const admin = createAdminClient();
  const { data: f } = await admin.from("files").select("path, content_type").eq("id", fileId).maybeSingle();
  if (!f || !(IMAGE.has(f.content_type) || f.content_type === "application/pdf")) return null;
  const { data: blob } = await admin.storage.from(BUCKET).download(f.path);
  if (!blob) return null;
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const block: Anthropic.Beta.BetaContentBlockParam =
    f.content_type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: f.content_type as "image/jpeg" | "image/png" | "image/webp", data } };
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 1500,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            block,
            {
              type: "text",
              text: `飲食店・美容室を営む会社の、店の経費のレシート（領収書）です。送った人の入力：日付 ${payload.date}・金額 ${payload.amount}円・何を買ったか「${payload.item}」・何に使ったか「${payload.purpose}」。
JSON だけを返してください（前後に文を付けない）：
{"vendor": "お店・取引先の名前", "date": "レシートの日付 YYYY-MM-DD（読めなければ null）", "amount": レシートの合計（税込・円。読めなければ null）, "tax_rate": 10 か 8 か 0（軽減税率の食品は8。混ざっていれば多いほう）, "account_title": "勘定科目（${ACCOUNT_TITLES.join("・")} のどれか。食材は材料仕入、酒・ジュースなど飲み物は酒類仕入、店で使う消耗品は店舗消耗品費、長く使う道具・備品は消耗備品費、文房具は事務用品費、掃除・害虫対策は衛生費）", "note": "送った人の入力とレシートが食い違う点・気をつける点（なければ空）"}`,
            },
          ],
        },
      ],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Suggest;
  } catch (e) {
    console.error("readReceipt failed", e);
    return null;
  }
}

/** 経費の報告を承認したとき：経費のデータに入れる（AI の案つき） */
export async function recordExpense(ctx: ApplyContext): Promise<Record<string, unknown>> {
  const admin = createAdminClient();
  const p = ctx.payload;
  const fileId = String(p.photo ?? "") || null;
  const ai = fileId ? await readReceipt(fileId, p) : null;
  const { data: store } = ctx.storeId ? await admin.from("stores").select("company_id").eq("id", ctx.storeId).maybeSingle() : { data: null };
  const account = ai?.account_title && (ACCOUNT_TITLES as readonly string[]).includes(ai.account_title) ? ai.account_title : null;
  const notes = [
    ai?.note,
    ai?.amount && Number(ai.amount) !== Number(p.amount) ? `レシートの合計は ${Number(ai.amount).toLocaleString()}円（報告は ${Number(p.amount).toLocaleString()}円）` : "",
    ai?.date && ai.date !== p.date ? `レシートの日付は ${ai.date}（報告は ${p.date}）` : "",
  ].filter(Boolean);
  const { data, error } = await admin
    .from("expenses")
    .upsert(
      {
        report_id: ctx.reportId,
        store_id: ctx.storeId,
        company_id: store?.company_id ?? null,
        reporter_id: ctx.reporterId,
        receipt_file_id: fileId,
        expense_date: String(p.date),
        amount: Number(p.amount),
        tax_rate: ai?.tax_rate === 8 || ai?.tax_rate === 0 ? ai.tax_rate : 10,
        payment_method: String(p.payment ?? "").startsWith("会社の口座") ? "transfer" : "cash",
        vendor: ai?.vendor?.slice(0, 100) ?? null,
        item: String(p.item ?? "").slice(0, 200),
        purpose: String(p.purpose ?? "").slice(0, 200),
        account_title: account,
        ai_note: notes.join("／") || null,
        approved_by: ctx.reviewerId,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "report_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error("経費のデータに入れられませんでした");
  return { expenseId: data.id, notice: `経費（${Number(p.amount).toLocaleString()}円）を承認しました${account ? `（勘定科目：${account}）` : ""}` };
}
