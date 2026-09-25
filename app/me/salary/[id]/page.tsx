import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Payslip, PAYSLIP_COLUMNS, type PayslipRecord } from "@/app/payslip";
import { PrintButton } from "@/app/print-button";

export default async function MyPayslipPage({ params }: PageProps<"/me/salary/[id]">) {
  const me = await requireStaff();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("salary_records")
    .select(PAYSLIP_COLUMNS)
    .eq("id", id)
    .eq("staff_id", me.id)
    .eq("status", "confirmed")
    .maybeSingle<PayslipRecord>();
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href="/me" className="text-sm text-stone-500 hover:text-stone-800">
          ← マイページ
        </Link>
        <PrintButton label="印刷・PDF保存" />
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-5 print:border-0 print:p-0">
        <Payslip r={data} />
      </div>
    </div>
  );
}
