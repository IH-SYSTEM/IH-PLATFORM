import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { canUseSlips, inventoryStatus, inventoryStores } from "@/lib/inventory";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";

export const metadata = { title: "棚卸しシステム" };

const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

/** 棚卸しシステムの入口：店ごとの「今の期間・仕入れ・在庫・原価の目安」と、各機能への入口 */
export default async function InventoryHome({ searchParams }: PageProps<"/inventory">) {
  const me = await requireStaff();
  const stores = await inventoryStores(me);
  if (!stores.length) redirect("/");
  const { store: sp } = await searchParams;
  const store = stores.find((s) => s.id === sp) ?? stores.find((s) => s.enabled) ?? stores[0];
  const st = await inventoryStatus(store.id);
  const slipsOk = canUseSlips(me);
  const { count: waiting } = slipsOk
    ? await createAdminClient().from("delivery_slips").select("id", { count: "exact", head: true }).in("status", ["reading", "pending"])
    : { count: 0 };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="棚卸しシステム" description="買ったもの（納品伝票・仕入れのレシート）と、残っているもの（棚卸し）から、いつでも今の原価が分かります" />

      <div className="flex flex-wrap gap-2">
        {stores.map((s) => (
          <Link key={s.id} href={`/inventory?store=${s.id}`} className={`rounded-full px-4 py-1.5 text-sm font-bold ${s.id === store.id ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {s.name}
            {!s.enabled && <span className="ml-1 text-[11px] font-normal opacity-70">（オープン前）</span>}
          </Link>
        ))}
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label={`期首の在庫（${md(st.period.start_date)}）`} value={yen(st.openingValue)} />
        <Stat label="この期間の仕入れ" value={yen(st.purchases.total)} sub={`伝票 ${st.purchases.slipCount}枚 ${yen(st.purchases.slipTotal)}・レシート ${yen(st.purchases.receiptTotal)}`} />
        <Stat label="最後の棚卸し" value={st.lastCount ? yen(st.lastCount.value) : "—"} sub={st.lastCount ? `${md(st.lastCount.counted_on)} に数えた在庫` : "まだ数えていません"} />
        <Stat
          label="原価率の目安"
          value={st.cost?.rate !== null && st.cost?.rate !== undefined ? pct(st.cost.rate) : "—"}
          sub={st.cost ? `原価 ${yen(st.cost.cost)}／売上 ${yen(st.cost.sales)}（${md(st.period.start_date)}〜${md(st.cost.until)}）${store.target !== null ? `・目標 ${pct(store.target)}` : ""}` : "棚卸しをすると出ます"}
          alert={!!(st.cost?.rate && store.target !== null && st.cost.rate > store.target)}
        />
      </section>
      <p className="text-xs text-slate-500">原価 ＝ 期首の在庫 ＋ 仕入れ − 数えた在庫（税込の仕入れ値）。会計の数字ではなく、買いすぎに早く気づくための目安です</p>

      <section className="grid gap-3 sm:grid-cols-2">
        <Entry href={`/inventory/count?store=${store.id}`} title="棚卸しをする" body={`今ある数を入れます（${st.rows.length}品目）。いつでも数えられ、「期首確定」で次の期間の期首になります`} primary />
        {slipsOk && <Entry href="/inventory/slips" title="納品伝票を取り込む" body={`スキャン・写真の伝票を AI が読み、確かめて保存します${waiting ? `（確認待ち ${waiting}枚）` : ""}`} />}
        <Entry href="/expenses" title="レシートを送る" body="店で買った仕入れ（材料・酒）のレシートを撮って送ります。雑費は原価に入りません" />
        <Entry href={`/inventory/items?store=${store.id}`} title="品目" body="数える単位・ケースの入り数・数えるかどうかを決めます" />
      </section>
      {!st.lastCount && st.openingValue === 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          はじめて使うときは、まず今ある在庫を数えて「期首確定」を押してください。そこから原価の計算が始まります
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-md border p-4 ${alert ? "border-accent bg-accent-soft/30" : "border-line bg-white"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${alert ? "text-accent" : "text-slate-900"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Entry({ href, title, body, primary }: { href: string; title: string; body: string; primary?: boolean }) {
  return (
    <Link href={href} className={`block rounded-md border p-5 transition hover:shadow-sm ${primary ? "border-brand bg-brand text-white" : "border-line bg-white hover:border-brand"}`}>
      <p className={`text-base font-bold ${primary ? "text-white" : "text-slate-900"}`}>{title} ›</p>
      <p className={`mt-1 text-sm ${primary ? "text-white/80" : "text-slate-500"}`}>{body}</p>
    </Link>
  );
}
