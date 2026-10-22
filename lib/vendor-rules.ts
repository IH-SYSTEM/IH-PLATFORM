import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 請求書の取引先の決まり（2026-10-22）。一度確かめた取引先は、次から店・勘定科目を自動で振り分ける。
 * 探す順：登録番号（T＋13桁）→ 取引先の名前（空白・会社の種類を除いたもの）
 */
export const vendorKey = (vendor: string | null | undefined) =>
  (vendor ?? "")
    .replace(/株式会社|有限会社|合同会社|（株）|\(株\)|（有）|\(有\)|㈱|㈲/g, "")
    .replace(/[\s　・.,、。]/g, "")
    .toLowerCase()
    .slice(0, 120) || null;

export type VendorRule = { id: string; store_id: string | null; account_title: string | null; tax_rate: number | null };

export async function findVendorRule(invoiceNumber: string | null, vendor: string | null): Promise<VendorRule | null> {
  const keys = [invoiceNumber, vendorKey(vendor)].filter(Boolean) as string[];
  if (!keys.length) return null;
  const { data } = await createAdminClient().from("vendor_rules").select("id, key, store_id, account_title, tax_rate").in("key", keys);
  return (data ?? []).sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key))[0] ?? null;
}

/** 確かめた請求書から覚える（登録番号と名前の両方で） */
export async function learnVendorRule(e: { id: string; invoice_number: string | null; vendor: string | null; store_id: string | null; account_title: string | null; tax_rate: number | null }, by: string) {
  if (!e.store_id || !e.account_title) return;
  const keys = [e.invoice_number, vendorKey(e.vendor)].filter(Boolean) as string[];
  if (!keys.length) return;
  await createAdminClient()
    .from("vendor_rules")
    .upsert(
      keys.map((key) => ({ key, vendor: e.vendor, store_id: e.store_id, account_title: e.account_title, tax_rate: e.tax_rate, learned_from: e.id, updated_by: by, updated_at: new Date().toISOString() })),
      { onConflict: "key" },
    );
}
