import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJa } from "@/lib/format";
import { RosterSheet, ROSTER_COLUMNS, type RosterStaff } from "../roster-sheet";
import { PrintButton } from "../print-button";

export default async function RosterPrintPage({ searchParams }: PageProps<"/admin/roster/print">) {
  await requireAdmin();
  const { id, tab, store } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("staff").select(ROSTER_COLUMNS).order("furigana", { nullsFirst: false });
  if (typeof id === "string") query = query.eq("id", id);
  else {
    query = query.eq("retired", tab === "retired");
    if (typeof store === "string" && store) query = query.eq("store_id", store);
  }
  const { data } = await query.returns<RosterStaff[]>();
  const staff = data ?? [];
  const createdOn = todayJa();

  return (
    <div className="space-y-6">
      <div className="no-print mx-auto flex max-w-[182mm] flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/roster" className="text-sm text-slate-500 hover:text-slate-800">
            ← 労働者名簿
          </Link>
          <p className="mt-1 text-sm text-slate-600">{staff.length}名分（A4・1名1ページ）</p>
        </div>
        <PrintButton />
      </div>
      <div className="space-y-6 print:space-y-0">
        {staff.map((s) => (
          <div key={s.id} className="break-after-page rounded-xl bg-white p-[10mm] shadow-sm last:break-after-auto print:rounded-none print:p-0 print:shadow-none">
            <RosterSheet s={s} createdOn={createdOn} />
          </div>
        ))}
      </div>
    </div>
  );
}
