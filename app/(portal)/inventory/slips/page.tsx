import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { canUseSlips } from "@/lib/inventory";
import { createAdminClient } from "@/lib/supabase/admin";
import { SlipUploader } from "./slip-uploader";

export const metadata = { title: "納品伝票" };
export const maxDuration = 300;

const md = (d: string | null) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "—");

/** 納品伝票（経理）：取り込み、確認待ち、最近保存したもの */
export default async function SlipsPage() {
  const me = await requireStaff();
  if (!canUseSlips(me)) redirect("/inventory");
  const admin = createAdminClient();
  const [{ data: stores }, { data: queue }, { data: recent }] = await Promise.all([
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("delivery_slips").select("id, status, store_id, vendor, slip_date, total, ai_note, ai_error").in("status", ["reading", "pending"]).order("created_at").limit(300),
    admin.from("delivery_slips").select("id, store_id, vendor, slip_date, total").eq("status", "approved").order("reviewed_at", { ascending: false }).limit(30),
  ]);
  const name = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const pending = (queue ?? []).filter((q) => q.status === "pending");
  const row = (s: { id: string; store_id: string | null; vendor: string | null; slip_date: string | null; total: number | null }, extra?: React.ReactNode, q = false) => (
    <li key={s.id}>
      <Link href={`/inventory/slips/${s.id}${q ? "?q=1" : ""}`} className="grid grid-cols-[4rem_7rem_minmax(0,1fr)_6rem] items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
        <span className="tabular-nums text-slate-500">{md(s.slip_date)}</span>
        <span className="truncate text-slate-600">{name.get(s.store_id ?? "") ?? "店が未定"}</span>
        <span className="truncate text-slate-800">
          {s.vendor ?? "—"} {extra}
        </span>
        <span className="text-right font-bold tabular-nums">{s.total !== null ? `${s.total.toLocaleString()}円` : "—"}</span>
      </Link>
    </li>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/inventory" className="text-sm text-slate-500">
          ‹ 棚卸しシステム
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">納品伝票</h1>
      </div>
      <SlipUploader meId={me.id} stores={stores ?? []} />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">確認待ち（{(queue ?? []).length}枚）</h2>
          {pending[0] && (
            <Link href={`/inventory/slips/${pending[0].id}?q=1`} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
              確認をはじめる
            </Link>
          )}
        </div>
        {queue?.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
            {queue.map((s) => row(s, s.status === "reading" ? <span className="text-xs text-slate-400">AI が読んでいます…</span> : s.ai_note || s.ai_error ? <span className="text-xs font-bold text-amber-700">要確認</span> : null, true))}
          </ul>
        ) : (
          <p className="rounded-md border border-line bg-white p-5 text-center text-sm text-slate-400">ありません</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">最近保存した伝票</h2>
        {recent?.length ? <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">{recent.map((s) => row(s))}</ul> : <p className="text-sm text-slate-400">まだありません</p>}
      </section>
    </div>
  );
}
