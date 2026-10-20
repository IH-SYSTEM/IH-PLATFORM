import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { canUseSlips } from "@/lib/inventory";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReceiptView } from "@/app/(portal)/admin/expenses/[id]/expense-editor";
import { SlipEditor } from "./slip-editor";

export const metadata = { title: "納品伝票の確認" };
export const maxDuration = 120;

const STATUS: Record<string, string> = { reading: "AI が読んでいます", pending: "確認待ち", approved: "保存済み", rejected: "取り消し" };

/** 納品伝票1枚：左に画像、右に AI が読んだ内容（直せる）。?q=1 は確認待ちを順に処理している途中 */
export default async function SlipPage({ params, searchParams }: PageProps<"/inventory/slips/[id]">) {
  const me = await requireStaff();
  if (!canUseSlips(me)) redirect("/inventory");
  const { id } = await params;
  const queue = (await searchParams).q === "1";
  const admin = createAdminClient();
  const { data: s } = await admin.from("delivery_slips").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [{ data: lines }, { data: stores }, { data: items }, { data: file }, { count: left }] = await Promise.all([
    admin.from("delivery_slip_lines").select("raw_name, item_id, qty, unit, unit_price, amount, tax_rate").eq("slip_id", id).order("sort"),
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("inventory_items").select("id, name, store_id").eq("active", true).order("name"),
    s.file_id ? admin.from("files").select("content_type").eq("id", s.file_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("delivery_slips").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/inventory/slips" className="text-sm text-slate-500">
          ‹ 納品伝票
        </Link>
        <h1 className="text-xl font-bold text-slate-900">納品伝票の確認</h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">{STATUS[s.status]}</span>
        {queue && <span className="text-xs text-slate-500">確認待ち 残り {left ?? 0}枚</span>}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>{s.file_id ? <ReceiptView src={`/files/${s.file_id}`} pdf={file?.content_type === "application/pdf"} /> : <p className="text-sm text-slate-400">画像がありません</p>}</div>
        <div className="space-y-3">
          {(s.ai_note || s.ai_error || s.status === "reading") && (
            <div className="space-y-1 rounded-md border border-line bg-white p-3 text-xs">
              {s.status === "reading" && <p className="text-slate-500">AI が読んでいます。少し待って再読み込みしてください</p>}
              {s.ai_error && <p className="font-bold text-accent">{s.ai_error}</p>}
              {s.ai_note && <p className="font-bold text-amber-700">AI：{s.ai_note}</p>}
            </div>
          )}
          <div className="rounded-md border border-line bg-white p-4">
            <SlipEditor
              key={s.id + s.updated_at}
              id={s.id}
              status={s.status}
              queue={queue}
              stores={stores ?? []}
              items={items ?? []}
              initial={{
                store_id: s.store_id ?? "",
                vendor: s.vendor ?? "",
                slip_date: s.slip_date ?? "",
                tax8: s.tax8 === null ? "" : String(s.tax8),
                tax10: s.tax10 === null ? "" : String(s.tax10),
                lines: (lines ?? []).map((l) => ({
                  raw_name: l.raw_name,
                  // AI が品目に当てはめられなかった行は、ふつう新しい品目にする
                  item: l.item_id ?? "new",
                  qty: Number(l.qty),
                  unit: l.unit ?? "",
                  unit_price: l.unit_price === null ? null : Number(l.unit_price),
                  amount: l.amount,
                  tax_rate: l.tax_rate,
                })),
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
