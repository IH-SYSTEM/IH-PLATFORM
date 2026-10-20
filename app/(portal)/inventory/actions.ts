"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { readDeliverySlip } from "@/lib/delivery-slips";
import { CATEGORIES, canUseSlips, inventoryStores, openPeriod, storeItems } from "@/lib/inventory";
import { stockValue, unitCostOf } from "@/lib/inventory-calc";
import { createAdminClient } from "@/lib/supabase/admin";

export type InvState = { ok?: string; error?: string; nextId?: string | null; at?: number } | undefined;
const fail = (error: string): InvState => ({ error, at: Date.now() });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

async function canStore(storeId: string) {
  const me = await requireStaff();
  const stores = await inventoryStores(me);
  return { me, ok: stores.some((s) => s.id === storeId) };
}

/** 納品伝票を取り込む（経理）。先に保存場所へ上げたファイルを、伝票として登録し、裏で AI が読む。店は「AIにまかせる」も可 */
export async function addSlips(input: { storeId: string | null; fileIds: string[]; source: "upload" | "photo" }): Promise<InvState> {
  const me = await requireStaff();
  if (!canUseSlips(me)) return fail("納品伝票は経理の担当だけが取り込めます");
  const admin = createAdminClient();
  const { data: files } = await admin.from("files").select("id").in("id", input.fileIds.slice(0, 100)).eq("uploaded_by", me.id).eq("status", "ready");
  const { data: used } = await admin.from("delivery_slips").select("file_id").in("file_id", (files ?? []).map((f) => f.id));
  const ids = (files ?? []).map((f) => f.id).filter((id) => !(used ?? []).some((u) => u.file_id === id));
  if (!ids.length) return fail("取り込めるファイルがありません");
  const { data: rows, error } = await admin
    .from("delivery_slips")
    .insert(ids.map((file_id) => ({ file_id, store_id: input.storeId, source: input.source, created_by: me.id })))
    .select("id");
  if (error || !rows) return fail("取り込めませんでした");
  await audit({ actor: me.id, action: "create", targetType: "delivery_slips", detail: { count: rows.length, store: input.storeId } });
  after(async () => {
    for (let i = 0; i < rows.length; i += 3) await Promise.all(rows.slice(i, i + 3).map((r) => readDeliverySlip(r.id)));
  });
  revalidatePath("/inventory/slips");
  return { ok: `${rows.length}枚を取り込みました。AI が読んでいます（1枚30秒ほど）`, at: Date.now() };
}

export type SlipInput = {
  store_id: string;
  vendor: string;
  slip_date: string;
  tax8: string;
  tax10: string;
  lines: { raw_name: string; item: string; qty: number; unit: string; unit_price: number | null; amount: number; tax_rate: number }[]; // item: 品目id／"new"（新しい品目にする）／""（数えない）
};

/** 納品伝票を保存（approve=true で確定）。「新しい品目」はその店の品目に登録し、確定したら品目の単価を最新にする */
export async function saveSlip(id: string, input: SlipInput, approve: boolean): Promise<InvState> {
  const me = await requireStaff();
  if (!canUseSlips(me)) return fail("納品伝票は経理の担当だけが扱えます");
  const admin = createAdminClient();
  const { data: slip } = await admin.from("delivery_slips").select("id, status").eq("id", id).maybeSingle();
  if (!slip) return fail("伝票が見つかりません");
  if (!input.store_id) return fail("店を選んでください");
  if (approve && !DATE.test(input.slip_date)) return fail("納品日を入れてください");
  const lines = input.lines.map((l) => ({ ...l, raw_name: l.raw_name.trim().slice(0, 100), amount: Math.round(Number(l.amount)), qty: Number(l.qty) || 1 })).filter((l) => l.raw_name && l.amount);
  if (approve && !lines.length) return fail("品目の行を入れてください");
  const items = await storeItems(input.store_id);
  const resolved = [];
  for (const l of lines) {
    let itemId: string | null = l.item && l.item !== "new" ? l.item : null;
    if (itemId && !items.some((i) => i.id === itemId)) itemId = null;
    if (l.item === "new") {
      const name = l.raw_name.slice(0, 60);
      const existing = items.find((i) => i.name === name);
      if (existing) itemId = existing.id;
      else {
        const { data: made } = await admin.from("inventory_items").insert({ store_id: input.store_id, name, count_unit: l.unit || "個" }).select("id, name, category, count_unit, per_purchase, unit_cost, track, aliases, active").single();
        if (made) {
          itemId = made.id;
          items.push({ ...made, per_purchase: Number(made.per_purchase), unit_cost: null });
        }
      }
    }
    resolved.push({ ...l, item_id: itemId });
  }
  const total = resolved.reduce((a, l) => a + l.amount, 0);
  const num = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(/[,円\s]/g, ""))) || null);
  const now = new Date().toISOString();
  const { error } = await admin
    .from("delivery_slips")
    .update({
      store_id: input.store_id,
      vendor: input.vendor.trim().slice(0, 100) || null,
      slip_date: DATE.test(input.slip_date) ? input.slip_date : null,
      total: total || null,
      tax8: num(input.tax8),
      tax10: num(input.tax10),
      updated_at: now,
      ...(approve ? { status: "approved", reviewed_by: me.id, reviewed_at: now } : slip.status === "reading" ? { status: "pending" } : {}),
    })
    .eq("id", id);
  if (error) return fail("保存できませんでした");
  await admin.from("delivery_slip_lines").delete().eq("slip_id", id);
  if (resolved.length)
    await admin.from("delivery_slip_lines").insert(
      resolved.map((l, i) => ({ slip_id: id, sort: i, raw_name: l.raw_name, item_id: l.item_id, qty: l.qty, unit: l.unit || null, unit_price: l.unit_price, amount: l.amount, tax_rate: [0, 8, 10].includes(l.tax_rate) ? l.tax_rate : 8 })),
    );
  // 確定：品目の単価を最新にし、伝票での書き方をゆれとして覚える（次から AI が当てはめる）
  if (approve) {
    for (const l of resolved) {
      if (!l.item_id) continue;
      const it = items.find((i) => i.id === l.item_id);
      if (!it) continue;
      const cost = unitCostOf(l, it.per_purchase);
      const aliases = it.name !== l.raw_name && !it.aliases.includes(l.raw_name) ? [...it.aliases, l.raw_name].slice(-20) : it.aliases;
      await admin.from("inventory_items").update({ ...(cost !== null && cost > 0 ? { unit_cost: Math.round(cost * 100) / 100 } : {}), aliases }).eq("id", l.item_id);
    }
  }
  await audit({ actor: me.id, action: "update", targetType: "delivery_slip", targetId: id, detail: { approve, total, lines: resolved.length } });
  revalidatePath("/inventory");
  revalidatePath("/inventory/slips");
  let nextId: string | null | undefined;
  if (approve) {
    const { data: next } = await admin.from("delivery_slips").select("id").eq("status", "pending").neq("id", id).order("created_at").limit(1);
    nextId = next?.[0]?.id ?? null;
  }
  return { ok: approve ? "保存しました（仕入れに入りました）" : "保存しました", nextId, at: Date.now() };
}

export async function rejectSlip(id: string): Promise<InvState> {
  const me = await requireStaff();
  if (!canUseSlips(me)) return fail("納品伝票は経理の担当だけが扱えます");
  const admin = createAdminClient();
  await admin.from("delivery_slips").update({ status: "rejected", reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq("id", id).neq("status", "approved");
  const { data: next } = await admin.from("delivery_slips").select("id").eq("status", "pending").neq("id", id).order("created_at").limit(1);
  revalidatePath("/inventory/slips");
  return { ok: "取り消しました（仕入れに入れません）", nextId: next?.[0]?.id ?? null, at: Date.now() };
}

export async function rereadSlip(id: string): Promise<InvState> {
  const me = await requireStaff();
  if (!canUseSlips(me)) return fail("納品伝票は経理の担当だけが扱えます");
  await createAdminClient().from("delivery_slips").update({ status: "reading" }).eq("id", id).in("status", ["reading", "pending"]);
  after(() => readDeliverySlip(id));
  return { ok: "AI が読み直しています（30秒ほどで再読み込みしてください）", at: Date.now() };
}

/**
 * 棚卸しを保存する（いつでも）。closing=true は「期首確定」：この日の在庫を次の期間の期首にする
 * （残っている品目は、次の棚卸し表にも必ず出る）
 */
export async function saveCount(storeId: string, closing: boolean, _prev: InvState, fd: FormData): Promise<InvState> {
  const { me, ok } = await canStore(storeId);
  if (!ok) return fail("この店の棚卸しはできません");
  const date = String(fd.get("counted_on") ?? "");
  if (!DATE.test(date)) return fail("数えた日を入れてください");
  const admin = createAdminClient();
  const period = await openPeriod(storeId);
  if (date < period.start_date) return fail(`今の期間は ${period.start_date} からです。それより前の日では保存できません`);
  const items = await storeItems(storeId);
  const lines = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("q:")) continue;
    const raw = String(v).trim();
    if (raw === "") continue;
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty < 0) return fail("数は0以上で入れてください");
    const it = items.find((i) => i.id === k.slice(2));
    if (it) lines.push({ item_id: it.id, qty, unit_cost: it.unit_cost });
  }
  if (!lines.length) return fail("数を1つ以上入れてください");
  const value = stockValue(lines);
  const { data: count, error } = await admin.from("inventory_counts").insert({ store_id: storeId, period_id: period.id, counted_on: date, closing, value, counted_by: me.id }).select("id").single();
  if (error || !count) return fail("保存できませんでした");
  await admin.from("inventory_count_lines").insert(lines.map((l) => ({ ...l, count_id: count.id })));
  if (closing) {
    await admin.from("inventory_periods").update({ end_date: date, closed_by: me.id, closed_at: new Date().toISOString() }).eq("id", period.id);
    const { data: next } = await admin.from("inventory_periods").insert({ store_id: storeId, start_date: addDay(date) }).select("id").single();
    const keep = lines.filter((l) => l.qty > 0);
    if (next && keep.length) await admin.from("inventory_opening").insert(keep.map((l) => ({ period_id: next.id, item_id: l.item_id, qty: l.qty, unit_cost: l.unit_cost })));
  }
  await audit({ actor: me.id, action: "create", targetType: "inventory_count", targetId: count.id, detail: { storeId, date, closing, value } });
  revalidatePath("/inventory");
  return { ok: closing ? `期首確定しました。${addDay(date)} から新しい期間です（在庫 ${value.toLocaleString()}円）` : `保存しました（在庫 ${value.toLocaleString()}円）`, at: Date.now() };
}

/** 品目を直す（区分・数える単位・換算・数えるか・使うか） */
export async function saveItem(itemId: string, _prev: InvState, fd: FormData): Promise<InvState> {
  const admin = createAdminClient();
  const { data: item } = await admin.from("inventory_items").select("store_id").eq("id", itemId).maybeSingle();
  if (!item) return fail("品目が見つかりません");
  const { ok } = await canStore(item.store_id);
  if (!ok) return fail("この店の品目は直せません");
  const category = String(fd.get("category") ?? "");
  const per = Number(fd.get("per_purchase"));
  const cost = String(fd.get("unit_cost") ?? "").trim();
  if (!(CATEGORIES as readonly string[]).includes(category)) return fail("区分を選んでください");
  if (!Number.isFinite(per) || per <= 0) return fail("換算は0より大きい数で入れてください");
  const { error } = await admin
    .from("inventory_items")
    .update({
      name: String(fd.get("name") ?? "").trim().slice(0, 60) || undefined,
      category,
      count_unit: String(fd.get("count_unit") ?? "").trim().slice(0, 10) || "個",
      per_purchase: per,
      unit_cost: cost === "" ? null : Number(cost),
      track: fd.get("track") === "on",
      active: fd.get("active") === "on",
    })
    .eq("id", itemId);
  if (error) return fail(error.code === "23505" ? "同じ名前の品目があります" : "保存できませんでした");
  revalidatePath("/inventory/items");
  return { ok: "保存しました", at: Date.now() };
}
