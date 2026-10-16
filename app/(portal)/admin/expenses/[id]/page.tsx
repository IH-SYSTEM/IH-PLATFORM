import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { hasDuty } from "@/lib/duties";
import { ACCOUNT_TITLES } from "@/lib/expenses";
import { createAdminClient } from "@/lib/supabase/admin";
import { ExpenseEditor, ReceiptView, type EditorExpense } from "./expense-editor";

export const metadata = { title: "経費の確認" };
export const maxDuration = 120;

const STATUS: Record<string, string> = { reading: "AI が読んでいます", pending: "確認待ち", approved: "承認済み", rejected: "差し戻し" };
const when = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 経費1件：左にレシートの写真、右に AI が入れた内容（直せる）。?q=1 は「確認待ちを順に処理」の途中 */
export default async function ExpenseDetail({ params, searchParams }: PageProps<"/admin/expenses/[id]">) {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) return <p className="text-sm text-slate-600">経費は、経理の担当だけが見られます</p>;
  const { id } = await params;
  const queue = (await searchParams).q === "1";
  const admin = createAdminClient();
  const { data: e } = await admin.from("expenses").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();
  const [{ data: lines }, { data: stores }, { data: file }, { data: who }, { count: left }] = await Promise.all([
    admin.from("expense_lines").select("account_title, tax_rate, amount, item").eq("expense_id", id).order("sort"),
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    e.receipt_file_id ? admin.from("files").select("content_type").eq("id", e.receipt_file_id).maybeSingle() : Promise.resolve({ data: null }),
    e.reporter_id ? admin.from("staff").select("name").eq("id", e.reporter_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("expenses").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const editor: EditorExpense = {
    id: e.id,
    status: e.status,
    expense_date: e.expense_date,
    vendor: e.vendor,
    invoice_number: e.invoice_number,
    payment_method: e.payment_method,
    store_id: e.store_id,
    exported: !!e.exported_at,
    lines: lines?.length ? lines : e.amount ? [{ account_title: e.account_title, tax_rate: e.tax_rate ?? 10, amount: e.amount, item: e.item }] : [],
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={queue ? "/admin/expenses/review" : "/admin/expenses"} className="text-sm text-slate-500">
          ‹ {queue ? "確認待ちの一覧" : "経費"}
        </Link>
        <h1 className="text-xl font-bold text-slate-900">経費の確認</h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">{STATUS[e.status]}</span>
        {queue && <span className="text-xs text-slate-500">確認待ち 残り {left ?? 0}件</span>}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>{e.receipt_file_id ? <ReceiptView src={`/files/${e.receipt_file_id}`} pdf={file?.content_type === "application/pdf"} /> : <p className="text-sm text-slate-400">写真がありません</p>}</div>
        <div className="space-y-3">
          <div className="space-y-1 rounded-md border border-line bg-white p-3 text-xs text-slate-600">
            <p>
              送った人：<span className="font-bold text-slate-800">{who?.name ?? "—"}</span>・{when(e.created_at)}
            </p>
            {e.staff_memo && <p>店からのメモ：{e.staff_memo}</p>}
            {e.ai_error && <p className="font-bold text-accent">{e.ai_error}</p>}
            {e.ai_note && <p className="font-bold text-amber-700">AI：{e.ai_note}</p>}
            {e.status === "reading" && <p className="text-slate-500">AI が読んでいます。少し待って再読み込みしてください（止まっていれば「AI に読み直させる」）</p>}
            {e.status === "rejected" && e.reject_reason && <p className="font-bold text-accent">差し戻しの理由：{e.reject_reason}</p>}
          </div>
          <div className="rounded-md border border-line bg-white p-4">
            <ExpenseEditor key={e.id + e.updated_at} e={editor} titles={[...ACCOUNT_TITLES]} stores={stores ?? []} queue={queue} />
          </div>
        </div>
      </div>
    </div>
  );
}
