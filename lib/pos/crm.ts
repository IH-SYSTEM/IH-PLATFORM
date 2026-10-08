/**
 * 美容室の自社CRM（COOKIE for MEN＝cookie-crm、COOKIE熊本＝cookie-kmt）の来店記録を読む。
 * 各CRMのデータベースに置いた関数 ih_export_visits（合言葉つき・読み取り専用）を呼ぶ。
 * 来店1件＝会計1件・客数1人。金額は来店記録の price（税込）。メニューはカンマ区切りを分ける
 */
import type { PosReceipt } from "./airregi.ts";

type Visit = { id: string; visit_date: string; checkin_at: string | null; price: number; staff_name: string | null; service_menu: string | null; is_concept: boolean };

export async function fetchCrm(code: "CFM" | "SKC", from: string, to: string): Promise<{ receipts: PosReceipt[]; raw: string; error?: string }> {
  const url = process.env[`${code}_SUPABASE_URL`];
  const anon = process.env[`${code}_SUPABASE_ANON_KEY`];
  const secret = process.env[`${code}_EXPORT_SECRET`];
  if (!url || !anon || !secret) return { receipts: [], raw: "", error: `${code} の取り込み設定がありません` };
  const res = await fetch(`${url}/rest/v1/rpc/ih_export_visits`, {
    method: "POST",
    headers: { apikey: anon, authorization: `Bearer ${anon}`, "content-type": "application/json" },
    body: JSON.stringify({ p_secret: secret, p_from: from, p_to: to }),
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) return { receipts: [], raw, error: `${code} のCRMから読めませんでした（${res.status}）` };
  const visits = JSON.parse(raw) as Visit[];
  return {
    raw,
    receipts: visits.map((v) => {
      const menus = (v.service_menu ?? "").split(/[,、]/).map((s) => s.trim()).filter(Boolean);
      return {
        receiptNo: v.id,
        businessDate: v.visit_date,
        checkoutAt: v.checkin_at ?? `${v.visit_date}T12:00:00+09:00`,
        total: v.price ?? 0,
        tax: Math.round(((v.price ?? 0) * 10) / 110),
        people: 1,
        items: menus.length,
        discount: 0,
        payments: {},
        cashier: v.staff_name ?? "",
        slip: v.is_concept ? "コンセプト" : "",
        lines: menus.map((name) => ({ category: v.is_concept ? "コンセプト来店" : "", name, price: 0, qty: 1, discount: 0 })),
      };
    }),
  };
}
