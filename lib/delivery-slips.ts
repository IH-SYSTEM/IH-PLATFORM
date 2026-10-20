import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { BUCKET } from "@/lib/files";
import { storeItems } from "@/lib/inventory";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 納品伝票を AI が読む（2026-10-20）。お店（宛名）・取引先・日付・合計・税額と、品目ごとの行（数量・単位・単価・金額）。
 * 行は、その店の品目の一覧に当てはめる（同じものなら既にある名前、新しいものは null）。経理が画面で確かめて保存する
 */
const client = new Anthropic();
const IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);

type Line = { raw_name: string; item: string | null; qty: number; unit: string | null; unit_price: number | null; amount: number; tax_rate: 0 | 8 | 10 };
type Read = { store: string | null; vendor: string | null; date: string | null; total: number | null; tax8: number | null; tax10: number | null; lines: Line[]; note: string };

const int = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

async function readSlipFile(fileId: string, stores: { id: string; name: string }[], items: string[]): Promise<Read | null> {
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
    max_tokens: 6000,
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
            text: `飲食店の納品伝票（納品書）です。棚卸しと原価の目安に使います。次の JSON だけを返してください（前後に文を付けない）。
{
  "store": "納品先の店（${stores.map((s) => s.name).join("・")} のどれか。宛名・届け先から判断。分からなければ null）",
  "vendor": "取引先（伝票を出した会社）",
  "date": "納品日 YYYY-MM-DD（なければ伝票の日付）",
  "total": 合計（税込・円の整数）,
  "tax8": 8%の消費税の額（なければ null）,
  "tax10": 10%の消費税の額（なければ null）,
  "lines": [ { "raw_name": "伝票に書いてある品名", "item": "下の品目の一覧で同じものがあればその名前（なければ null）", "qty": 数量, "unit": "単位（ケース・本・kg・袋など）", "unit_price": 単価, "amount": 税込の金額（円の整数）, "tax_rate": 8 か 10 か 0 } ],
  "note": "気をつける点（読みにくい・合計が合わない・返品や値引きがある、など。なければ空）"
}
決まり：
- lines は品目ごとに1行。税抜の伝票なら、amount は税込に直す（8%か10%をかける）。値引き・返品はマイナスの行にする
- 酒・ジュース・日用品は10%、食品は8%（軽減税率の印があればそれに従う）
- lines の amount を全部足すと total と同じにする（送料・手数料も1行にする）
その店の品目の一覧：${items.length ? items.join("・") : "（まだない）"}`,
          },
        ],
      },
    ],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Partial<Read> & { lines?: Partial<Line>[] };
  return {
    store: typeof j.store === "string" ? j.store : null,
    vendor: typeof j.vendor === "string" ? j.vendor.slice(0, 100) : null,
    date: typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null,
    total: int(j.total),
    tax8: int(j.tax8),
    tax10: int(j.tax10),
    lines: (j.lines ?? [])
      .map((l) => ({
        raw_name: String(l.raw_name ?? "").slice(0, 100),
        item: typeof l.item === "string" && items.includes(l.item) ? l.item : null,
        qty: Number.isFinite(Number(l.qty)) && Number(l.qty) !== 0 ? Number(l.qty) : 1,
        unit: typeof l.unit === "string" ? l.unit.slice(0, 10) : null,
        unit_price: Number.isFinite(Number(l.unit_price)) ? Number(l.unit_price) : null,
        amount: int(l.amount) ?? 0,
        tax_rate: (l.tax_rate === 10 || l.tax_rate === 0 ? l.tax_rate : 8) as 0 | 8 | 10,
      }))
      .filter((l) => l.raw_name && l.amount !== 0),
    note: String(j.note ?? "").slice(0, 300),
  };
}

/** 届いた納品伝票1枚を読んで「確認待ち」にする（読めなくても確認待ちにして、人が入れる） */
export async function readDeliverySlip(slipId: string) {
  const admin = createAdminClient();
  const { data: slip } = await admin.from("delivery_slips").select("id, file_id, store_id, status").eq("id", slipId).maybeSingle();
  if (!slip?.file_id || (slip.status !== "reading" && slip.status !== "pending")) return;
  const { data: stores } = await admin.from("stores").select("id, name").eq("is_active", true);
  let storeId = slip.store_id;
  const items = storeId ? await storeItems(storeId) : [];
  let r: Read | null = null;
  let err: string | null = null;
  try {
    r = await readSlipFile(slip.file_id, stores ?? [], items.map((i) => i.name));
    if (!r) err = "伝票を読めませんでした（形式が違う・届いていない）";
  } catch (e) {
    console.error("readDeliverySlip failed", slipId, e);
    err = "AI が読めませんでした。画像を見て入れてください";
  }
  if (!storeId && r?.store) storeId = (stores ?? []).find((s) => s.name === r!.store || s.name.includes(r!.store!) || r!.store!.includes(s.name))?.id ?? null;
  // 店が後から分かったときは、その店の品目で当てはめ直す
  const named = storeId && !items.length ? await storeItems(storeId) : items;
  const notes: string[] = [];
  if (r?.note) notes.push(r.note);
  if (!storeId) notes.push("どの店の伝票か分かりませんでした。店を選んでください");
  const sum = (r?.lines ?? []).reduce((a, l) => a + l.amount, 0);
  if (r?.total && sum && sum !== r.total) notes.push(`行の合計（${sum.toLocaleString()}円）が伝票の合計（${r.total.toLocaleString()}円）と合いません`);
  if (r?.date && r.total && storeId) {
    const { data: dup } = await admin.from("delivery_slips").select("id").eq("store_id", storeId).eq("slip_date", r.date).eq("total", r.total).neq("id", slipId).neq("status", "rejected").limit(1);
    if (dup?.length) notes.push("同じ日・同じ金額の伝票がもう1枚あります（二重に取り込んでいないか確かめてください）");
  }
  await admin
    .from("delivery_slips")
    .update({
      status: "pending",
      store_id: storeId,
      vendor: r?.vendor ?? null,
      slip_date: r?.date ?? null,
      total: r?.total ?? (sum || null),
      tax8: r?.tax8 ?? null,
      tax10: r?.tax10 ?? null,
      ai_note: notes.join("／") || null,
      ai_error: err,
      ai_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", slipId);
  await admin.from("delivery_slip_lines").delete().eq("slip_id", slipId);
  if (r?.lines.length)
    await admin.from("delivery_slip_lines").insert(
      r.lines.map((l, i) => ({
        slip_id: slipId,
        sort: i,
        raw_name: l.raw_name,
        item_id: named.find((x) => x.name === l.item || x.aliases.includes(l.raw_name))?.id ?? null,
        qty: l.qty,
        unit: l.unit,
        unit_price: l.unit_price,
        amount: l.amount,
        tax_rate: l.tax_rate,
      })),
    );
}
