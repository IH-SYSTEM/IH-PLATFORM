/**
 * 一鴻（自社開発のレジ）の会計を、一鴻のシステムの書き出しAPI（/api/export/pos-sales）から読む。
 * 営業日・客数は一鴻の売上報告と同じ数え方（営業日は 5:00 切替）なので、一鴻の日報と数字がそろう
 */
import type { PosReceipt } from "./airregi.ts";

type IkkouOrder = {
  order_number: string;
  business_date: string;
  closed_at: string;
  total: number;
  tax: number;
  discount: number;
  headcount: number;
  payment_method: string | null;
  items: { name: string; unit_price: number; qty: number; category: string | null }[];
};

const PAYMENT_LABEL: Record<string, string> = { cash: "現金", card: "カード", qr: "QR決済" };

export async function fetchIkkou(from: string, to: string): Promise<{ receipts: PosReceipt[]; raw: string; error?: string }> {
  const url = process.env.IKKOU_EXPORT_URL;
  const secret = process.env.IKKOU_EXPORT_SECRET;
  if (!url || !secret) return { receipts: [], raw: "", error: "一鴻の取り込み設定（IKKOU_EXPORT_URL / IKKOU_EXPORT_SECRET）がありません" };
  const res = await fetch(`${url}?${new URLSearchParams({ from, to })}`, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store" });
  const raw = await res.text();
  if (!res.ok) return { receipts: [], raw, error: `一鴻のシステムから読めませんでした（${res.status}）` };
  const { orders } = JSON.parse(raw) as { orders: IkkouOrder[] };
  return {
    raw,
    receipts: orders.map((o) => ({
      receiptNo: o.order_number,
      businessDate: o.business_date,
      checkoutAt: o.closed_at,
      total: o.total,
      tax: o.tax,
      people: o.headcount,
      items: o.items.reduce((s, i) => s + i.qty, 0),
      discount: -Math.abs(o.discount || 0),
      payments: o.payment_method ? { [PAYMENT_LABEL[o.payment_method] ?? o.payment_method]: o.total } : {},
      cashier: "",
      slip: "",
      lines: o.items.map((i) => ({ category: i.category ?? "", name: i.name, price: i.unit_price, qty: i.qty, discount: 0 })),
    })),
  };
}
