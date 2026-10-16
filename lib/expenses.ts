import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { BUCKET } from "@/lib/files";
import type { ApplyContext } from "@/lib/reports/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 店の経費（2026-10-16）。
 *   店がレシートの写真を続けて撮って送る → 届いたらすぐ AI が読む（readExpense）→ 本部が写真を見ながら直して承認
 *   AI は、お店・日付・合計・登録番号（T＋13桁）と、勘定科目×税率ごとの内訳（税込）を入れる。気になる点は ai_note に
 *   （前のやり方：報告窓口の「経費の報告」を承認したとき recordExpense で入れる。残っている報告のために残す）
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

export const isAccountTitle = (s: unknown): s is string => typeof s === "string" && (ACCOUNT_TITLES as readonly string[]).includes(s);

const client = new Anthropic();
const IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ReadLine = { account_title: string | null; tax_rate: 0 | 8 | 10; amount: number; item: string };
export type ReadResult = {
  is_receipt: boolean;
  vendor: string | null;
  date: string | null;
  total: number | null;
  invoice_number: string | null;
  lines: ReadLine[];
  note: string;
};

const GUIDE = `勘定科目は次のどれか：${ACCOUNT_TITLES.join("・")}
  目安：食材・調味料・米 → 材料仕入／酒・ジュース・お茶など飲み物 → 酒類仕入／店で使ってなくなるもの（ラップ・ペーパー・洗剤・割り箸・おしぼり・ゴミ袋・電池） → 店舗消耗品費／
  長く使う道具・器・家電（10万円未満） → 消耗備品費／文房具・コピー用紙・インク → 事務用品費／掃除の道具・害虫対策・手洗い・消毒 → 衛生費／
  修理・部品 → 修繕費／切手・電話 → 通信費／ガス・電気・水道 → 水道光熱費／ガソリン・駐車場・高速 → 車両費／電車・バス・タクシー → 旅費交通費／
  振込手数料 → 支払手数料／チラシ・印刷・広告 → 広告宣伝費／お客様・取引先との飲食・お土産 → 接待交際費／スタッフのまかない以外の飲食・差し入れ → 福利厚生費／
  本・雑誌 → 新聞図書費／宅配便・送料 → 荷造運賃／収入印紙・証紙 → 租税公課／どれにも当たらない → 雑費`;

/** レシート（領収書）の写真を読む。読めないときは null */
export async function readReceipt(fileId: string, hint: { memo?: string | null; storeName?: string | null }): Promise<ReadResult | null> {
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
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 3000,
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
            text: `飲食店（和食・居酒屋）・美容室を営む会社の、店の経費のレシート（領収書）の写真です。${hint.storeName ? `店：${hint.storeName}。` : ""}${hint.memo ? `送った人のメモ：「${hint.memo}」。` : ""}
経理がマネーフォワードに入れるため、次の JSON だけを返してください（前後に文を付けない）。
{
  "is_receipt": レシート・領収書・請求書として読めるなら true（ぼやけて読めない・関係ない写真なら false）,
  "vendor": "お店・取引先の名前（チェーンは店名まで。読めなければ null）",
  "date": "日付 YYYY-MM-DD（読めなければ null）",
  "total": 合計（税込・円の整数。読めなければ null）,
  "invoice_number": "登録番号 T＋13桁（例 T1234567890123。なければ null）",
  "lines": [ { "account_title": "勘定科目", "tax_rate": 10 か 8 か 0, "amount": 税込の金額（円の整数）, "item": "何を買ったか（短く。例：鶏もも・玉ねぎ、キッチンペーパー）" } ],
  "note": "経理が気をつける点（例：合計が読みにくい、手書きの領収書で但し書きがない、個人的な買い物が混ざっていそう、日付が古い。なければ空）"
}
lines の決まり：
- 勘定科目×税率ごとに1行にまとめる（品目ごとではない）。lines の amount を全部足すと total と同じにする（値引き・ポイント利用は、その行から引く）
- 8% は軽減税率（食品・テイクアウト。※印や「軽」の印の品）。酒・外食・日用品は10%。印紙・切手・ゴミ処理券など消費税がかからないものは0
- レシートの「8%対象」「10%対象」の合計欄があれば、それに合わせる
${GUIDE}`,
          },
        ],
      },
    ],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Partial<ReadResult>;
  const lines = (Array.isArray(j.lines) ? j.lines : [])
    .map((l) => ({
      account_title: isAccountTitle(l?.account_title) ? l.account_title : null,
      tax_rate: (l?.tax_rate === 8 || l?.tax_rate === 0 ? l.tax_rate : 10) as 0 | 8 | 10,
      amount: Math.round(Number(l?.amount)),
      item: String(l?.item ?? "").slice(0, 200),
    }))
    .filter((l) => Number.isFinite(l.amount) && l.amount !== 0);
  const total = Number.isFinite(Number(j.total)) && j.total !== null ? Math.round(Number(j.total)) : null;
  const inv = typeof j.invoice_number === "string" ? j.invoice_number.replace(/[^\dT]/g, "").toUpperCase() : "";
  return {
    is_receipt: j.is_receipt !== false,
    vendor: typeof j.vendor === "string" ? j.vendor.slice(0, 100) : null,
    date: typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null,
    total,
    invoice_number: /^T\d{13}$/.test(inv) ? inv : null,
    lines,
    note: String(j.note ?? "").slice(0, 300),
  };
}

/** 届いた経費1件を AI に読ませ、結果を入れて「確認待ち」にする（読めなくても確認待ちにして、人が入れる） */
export async function readExpense(expenseId: string) {
  const admin = createAdminClient();
  const { data: e } = await admin.from("expenses").select("id, receipt_file_id, staff_memo, store_id, status").eq("id", expenseId).maybeSingle();
  if (!e?.receipt_file_id || (e.status !== "reading" && e.status !== "pending")) return;
  const { data: store } = e.store_id ? await admin.from("stores").select("name").eq("id", e.store_id).maybeSingle() : { data: null };
  let r: ReadResult | null = null;
  let err: string | null = null;
  try {
    r = await readReceipt(e.receipt_file_id, { memo: e.staff_memo, storeName: store?.name });
    if (!r) err = "写真を読めませんでした（形式が違う・届いていない）";
  } catch (x) {
    console.error("readExpense failed", expenseId, x);
    err = "AI が読めませんでした。写真を見て入れてください";
  }
  const notes: string[] = [];
  if (r && !r.is_receipt) notes.push("レシートとして読めませんでした。写真を確かめてください");
  if (r?.note) notes.push(r.note);
  const sum = (r?.lines ?? []).reduce((a, l) => a + l.amount, 0);
  if (r?.total && sum && sum !== r.total) notes.push(`内訳の合計（${sum.toLocaleString()}円）がレシートの合計（${r.total.toLocaleString()}円）と合いません`);
  // 同じレシートが2回届いていないか（お店・日付・金額が同じ）
  if (r?.date && r.total) {
    const { data: dup } = await admin.from("expenses").select("id").eq("expense_date", r.date).eq("amount", r.total).neq("id", expenseId).neq("status", "rejected").limit(1);
    if (dup?.length) notes.push("同じ日・同じ金額の経費がもう1件あります（二重に送っていないか確かめてください）");
  }
  if (r?.date && r.date < new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)) notes.push("3か月より前の日付です");
  await admin
    .from("expenses")
    .update({
      status: "pending",
      vendor: r?.vendor ?? null,
      expense_date: r?.date ?? null,
      amount: r?.total ?? (sum || null),
      invoice_number: r?.invoice_number ?? null,
      tax_rate: r?.lines[0]?.tax_rate ?? null,
      account_title: r?.lines[0]?.account_title ?? null,
      item: r?.lines.map((l) => l.item).filter(Boolean).join("、").slice(0, 200) || null,
      ai_note: notes.join("／") || null,
      ai_error: err,
      ai_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", expenseId)
    .in("status", ["reading", "pending"]);
  await admin.from("expense_lines").delete().eq("expense_id", expenseId);
  if (r?.lines.length) await admin.from("expense_lines").insert(r.lines.map((l, i) => ({ expense_id: expenseId, sort: i, ...l })));
}

/** 前のやり方：報告窓口の「経費の報告」を承認したとき、経費のデータに入れる（AI の案つき） */
export async function recordExpense(ctx: ApplyContext): Promise<Record<string, unknown>> {
  const admin = createAdminClient();
  const p = ctx.payload;
  const fileId = String(p.photo ?? "") || null;
  const ai = fileId ? await readReceipt(fileId, { memo: `${p.item}／${p.purpose}` }).catch(() => null) : null;
  const { data: store } = ctx.storeId ? await admin.from("stores").select("company_id").eq("id", ctx.storeId).maybeSingle() : { data: null };
  const first = ai?.lines[0];
  const notes = [
    ai?.note,
    ai?.total && ai.total !== Number(p.amount) ? `レシートの合計は ${ai.total.toLocaleString()}円（報告は ${Number(p.amount).toLocaleString()}円）` : "",
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
        tax_rate: first?.tax_rate ?? 10,
        payment_method: String(p.payment ?? "").startsWith("会社の口座") ? "transfer" : "cash",
        vendor: ai?.vendor ?? null,
        invoice_number: ai?.invoice_number ?? null,
        item: String(p.item ?? "").slice(0, 200),
        purpose: String(p.purpose ?? "").slice(0, 200),
        account_title: first?.account_title ?? null,
        ai_note: notes.join("／") || null,
        status: "approved",
        approved_by: ctx.reviewerId,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "report_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error("経費のデータに入れられませんでした");
  // 内訳：AI の内訳が報告の金額と合えばそれを、合わなければ1行
  const lines = ai?.lines.length && ai.lines.reduce((a, l) => a + l.amount, 0) === Number(p.amount) ? ai.lines : [{ account_title: first?.account_title ?? null, tax_rate: first?.tax_rate ?? 10, amount: Number(p.amount), item: String(p.item ?? "") }];
  await admin.from("expense_lines").delete().eq("expense_id", data.id);
  await admin.from("expense_lines").insert(lines.map((l, i) => ({ expense_id: data.id, sort: i, ...l })));
  return { expenseId: data.id, notice: `経費（${Number(p.amount).toLocaleString()}円）を承認しました${first?.account_title ? `（勘定科目：${first.account_title}）` : ""}` };
}
