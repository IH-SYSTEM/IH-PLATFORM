import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveCompany } from "../actions";
import { CompanyForm, type CompanyRecord } from "../company-form";

// id が "new" なら新規登録
export default async function CompanyEditPage({ params }: PageProps<"/admin/companies/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === "new";
  const { data: company } = isNew
    ? { data: null }
    : await (await createClient()).from("companies").select("*").eq("id", id).maybeSingle<CompanyRecord>();
  if (!isNew && !company) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/admin/companies" className="text-sm text-slate-500 hover:text-slate-800">
          ← 会社マスタ
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{company?.name ?? "会社を登録"}</h1>
      </div>
      <CompanyForm company={company} action={saveCompany.bind(null, company?.id ?? null)} />
    </div>
  );
}
