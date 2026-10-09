"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CompanySaveState = { ok?: boolean; error?: string; at?: number } | undefined;

export async function saveCompany(companyId: string | null, _prev: CompanySaveState, fd: FormData): Promise<CompanySaveState> {
  await requireAdmin();
  const fail = (error: string) => ({ error, at: Date.now() });
  const text = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const name = text("name");
  if (!name) return fail("会社名を入力してください");
  const code = text("code")?.toUpperCase() ?? null;
  if (!code || !/^[A-Z]{2,4}$/.test(code)) return fail("会社コードは英大文字2〜4文字で入力してください");
  const corporateNumber = text("corporate_number")?.replace(/[-\s]/g, "") ?? null;
  if (corporateNumber && !/^\d{13}$/.test(corporateNumber)) return fail("法人番号は13桁の数字で入力してください");
  const sort = Number(text("sort_order") ?? 0);

  const row = {
    name,
    code,
    name_kana: text("name_kana"),
    corporate_number: corporateNumber,
    representative: text("representative"),
    zipcode: text("zipcode"),
    address: text("address"),
    phone: text("phone"),
    sort_order: Number.isInteger(sort) ? sort : 0,
    is_active: companyId ? fd.get("is_active") === "on" : true,
  };
  const supabase = await createClient();
  const res = companyId
    ? await supabase.from("companies").update(row).eq("id", companyId).select("id").single()
    : await supabase.from("companies").insert(row).select("id").single();
  if (res.error) {
    if (res.error.code === "23505") return fail(`会社コード「${code}」はすでに使われています`);
    console.error("saveCompany failed", res.error);
    return fail("保存に失敗しました");
  }
  revalidatePath("/admin/companies");
  if (!companyId) redirect(`/admin/companies/${res.data.id}`);
  return { ok: true, at: Date.now() };
}
