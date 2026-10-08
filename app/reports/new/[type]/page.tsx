import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { businessDayJST, toJSTTimeString } from "@/lib/business-day";
import { reportType } from "@/lib/reports/registry";
import { CATEGORIES } from "@/lib/reports/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitReport } from "../../actions";
import { ReportForm } from "./report-form";

export default async function NewReportPage({ params }: PageProps<"/reports/new/[type]">) {
  const me = await requireStaff();
  const { type: key } = await params;
  const type = reportType(decodeURIComponent(key));
  if (!type) notFound();

  const admin = createAdminClient();
  const [{ data: stores }, { data: staff }, { data: self }] = await Promise.all([
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("staff").select("id, name, furigana, store_id, department_name").eq("retired", false),
    admin.from("staff").select("store_id").eq("id", me.id).single(),
  ]);
  const myStore = self?.store_id ?? null;
  // 自分の店のスタッフを先に、その中はふりがな順。自分は選べないので外す
  const staffOptions = (staff ?? [])
    .filter((s) => s.id !== me.id)
    .sort((a, b) => Number(b.store_id === myStore) - Number(a.store_id === myStore) || (a.furigana || a.name).localeCompare(b.furigana || b.name, "ja"))
    .map((s) => ({ value: s.id, label: s.store_id === myStore ? s.name : `${s.name}（${s.department_name ?? "所属なし"}）` }));

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/reports" className="inline-block text-sm text-slate-500 hover:text-brand">
        ‹ 報告窓口
      </Link>
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-slate-400">{CATEGORIES[type.category].label}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{type.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{type.description}</p>
        {type.superadminOnly && (
          <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
            この相談は、本部のごく限られた人（特別管理者）だけが読みます。店長や同僚には見えません
          </p>
        )}
      </div>
      <ReportForm
        meId={me.id}
        fields={type.fields}
        stores={(stores ?? []).map((s) => ({ value: s.id, label: s.name }))}
        defaultStore={myStore ?? ""}
        staff={staffOptions}
        defaults={{ date: businessDayJST(), time: toJSTTimeString(new Date().toISOString()) }}
        onSiteOnly={type.onSiteOnly}
        action={submitReport.bind(null, type.key)}
      />
    </div>
  );
}
