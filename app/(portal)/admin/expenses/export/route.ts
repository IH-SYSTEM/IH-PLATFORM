import type { NextRequest } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hasDuty } from "@/lib/duties";
import { mfCsv, type MfExpense } from "@/lib/mf-csv";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 経費をマネーフォワードの仕訳帳の CSV で書き出す（会社ごと・月ごと）。経理の担当と代表だけ。
 *   ?m=YYYY-MM&company=会社ID           … 承認済みで、まだ書き出していない経費（内訳の勘定科目が全部あるもの）を CSV に（確かめる用。印は付けない）
 *   &mark=1                              … 書き出して「書き出し済み」の印を付ける（次から出ない＝二重に取り込まない）
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentStaff();
  if (!me || !hasDuty(me, "keiri_input", "keiri_approve")) return new Response("経理の担当だけが書き出せます", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const month = sp.get("m") ?? "";
  const companyId = sp.get("company") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month) || !companyId) return new Response("月と会社を選んでください", { status: 400 });
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const admin = createAdminClient();
  const [{ data: rows }, { data: stores }, { data: company }] = await Promise.all([
    admin
      .from("expenses")
      .select("id, expense_date, store_id, vendor, invoice_number, payment_method, expense_lines(account_title, tax_rate, amount, item, sort)")
      .eq("company_id", companyId)
      .eq("status", "approved")
      .gte("expense_date", `${month}-01`)
      .lte("expense_date", last)
      .is("exported_at", null)
      .order("expense_date")
      .order("created_at"),
    admin.from("stores").select("id, name, mf_department"),
    admin.from("companies").select("name").eq("id", companyId).single(),
  ]);
  const dept = new Map((stores ?? []).map((s) => [s.id, s.mf_department || s.name]));
  // 内訳の勘定科目が全部決まっているものだけ出す
  const ready = (rows ?? []).filter((r) => r.expense_lines.length && r.expense_lines.every((l) => l.account_title));
  const list: MfExpense[] = ready.flatMap((r, i) =>
    [...r.expense_lines]
      .sort((a, b) => a.sort - b.sort)
      .map((l) => ({
        no: i + 1,
        date: r.expense_date!,
        account: l.account_title!,
        department: dept.get(r.store_id ?? "") ?? "",
        vendor: r.vendor,
        item: l.item,
        amount: l.amount,
        taxRate: l.tax_rate,
        payment: r.payment_method as "cash" | "transfer",
        invoice: r.invoice_number,
      })),
  );
  if (sp.get("mark") === "1" && ready.length) {
    await admin.from("expenses").update({ exported_at: new Date().toISOString() }).in("id", ready.map((r) => r.id));
  }
  await audit({ actor: me.id, action: "export", targetType: "expense_mf_csv", targetId: companyId, detail: { month, count: ready.length, lines: list.length, mark: sp.get("mark") === "1" } });
  const name = `マネーフォワード仕訳_${(company?.name ?? "").replace("株式会社", "")}_${month}${sp.get("mark") === "1" ? "" : "_確認用"}.csv`;
  return new Response(new Uint8Array(mfCsv(list)), {
    headers: {
      "Content-Type": "text/csv; charset=Shift_JIS",
      "Content-Disposition": `attachment; filename="mf.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
