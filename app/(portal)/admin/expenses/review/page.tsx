import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { hasDuty } from "@/lib/duties";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "経費の確認待ち" };

const when = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 届いたレシートの確認待ち（古い順）。「はじめる」で1件ずつ、承認すると次が開く */
export default async function ExpenseReviewQueue() {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) return <p className="text-sm text-slate-600">経費は、経理の担当だけが見られます</p>;
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("expenses")
    .select("id, status, expense_date, amount, vendor, store_id, reporter_id, ai_note, ai_error, created_at")
    .in("status", ["reading", "pending", "question"])
    .order("created_at")
    .limit(300);
  const [{ data: stores }, { data: people }] = await Promise.all([
    admin.from("stores").select("id, name"),
    admin.from("staff").select("id, name").in("id", [...new Set((rows ?? []).map((r) => r.reporter_id).filter(Boolean))] as string[]),
  ]);
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const name = new Map((people ?? []).map((p) => [p.id, p.name]));
  const pending = (rows ?? []).filter((r) => r.status === "pending" || r.status === "question");
  const reading = (rows ?? []).filter((r) => r.status === "reading");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/expenses" className="text-sm text-slate-500">
          ‹ 経費
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">経費の確認待ち</h1>
      </div>
      {pending.length ? (
        <Link href={`/admin/expenses/${pending[0].id}?q=1`} className="block rounded-xl bg-brand px-5 py-5 text-center text-white">
          <span className="block text-lg font-bold">確認をはじめる（{pending.length}件）</span>
          <span className="text-xs text-white/75">写真を見て、AI が入れた内容でよければ「承認して次へ」（Ctrl/⌘＋Enter）。違うところだけ直します</span>
        </Link>
      ) : (
        <p className="rounded-md border border-line bg-white p-6 text-center text-sm text-slate-500">確認待ちはありません 🎉</p>
      )}
      {reading.length > 0 && <p className="text-xs text-slate-500">AI が読んでいるもの：{reading.length}件（読み終わると上に入ります）</p>}

      {(rows ?? []).length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white text-sm">
          {(rows ?? []).map((r) => (
            <li key={r.id}>
              <Link href={`/admin/expenses/${r.id}?q=1`} className="grid grid-cols-[4.5rem_minmax(0,1fr)_6rem] items-center gap-3 px-4 py-2.5 hover:bg-slate-50 sm:grid-cols-[4.5rem_8rem_minmax(0,1fr)_6rem]">
                <span className="tabular-nums text-slate-500">{r.expense_date ? `${Number(r.expense_date.slice(5, 7))}/${Number(r.expense_date.slice(8, 10))}` : "—"}</span>
                <span className="hidden truncate text-slate-500 sm:block">{storeName.get(r.store_id ?? "")}</span>
                <span className="min-w-0 truncate">
                  <span className="text-slate-800">{r.status === "reading" ? "AI が読んでいます…" : (r.vendor ?? "（お店が読めません）")}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {name.get(r.reporter_id ?? "")}・{when(r.created_at)}
                  </span>
                  {(r.ai_note || r.ai_error) && <span className="ml-2 text-xs font-bold text-amber-700">要確認</span>}
                </span>
                <span className="text-right font-bold tabular-nums">{r.amount !== null ? `${r.amount.toLocaleString()}円` : "—"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
