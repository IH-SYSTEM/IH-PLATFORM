import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { CATEGORIES, inventoryStores, storeItems } from "@/lib/inventory";
import { saveItem } from "../actions";
import { ItemRow } from "./item-row";

export const metadata = { title: "品目" };

/** 店の品目。納品伝票を保存すると自動で増える。数える単位・ケースの入り数・数えるかどうかを決める */
export default async function ItemsPage({ searchParams }: PageProps<"/inventory/items">) {
  const me = await requireStaff();
  const stores = await inventoryStores(me);
  const { store: sp } = await searchParams;
  const store = stores.find((s) => s.id === sp) ?? stores[0];
  if (!store) redirect("/inventory");
  const items = await storeItems(store.id);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href={`/inventory?store=${store.id}`} className="text-sm text-slate-500">
        ‹ 棚卸しシステム
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">{store.name}の品目</h1>
      <div className="flex flex-wrap gap-2">
        {stores.map((s) => (
          <Link key={s.id} href={`/inventory/items?store=${s.id}`} className={`rounded-full px-3 py-1 text-sm font-bold ${s.id === store.id ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {s.name}
          </Link>
        ))}
      </div>
      <p className="text-sm text-slate-500">
        納品伝票を保存すると、新しい品目はここに増えます。ビールのように「ケースで買って本で数える」ものは、入り数（1ケース＝24本 なら 24）を入れてください。その日に使い切る野菜などは「数える」を外すと、棚卸し表に出ません
      </p>
      {items.length ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-md border border-line bg-white">
          <div className="hidden grid-cols-[minmax(0,1fr)_6rem_4.5rem_5rem_6rem_auto] gap-2 bg-slate-50 px-4 py-2 text-xs text-slate-500 sm:grid">
            <span>品目</span>
            <span>区分</span>
            <span>数える単位</span>
            <span className="text-right">入り数</span>
            <span className="text-right">単価（税込）</span>
            <span />
          </div>
          {items.map((i) => (
            <ItemRow key={i.id} item={i} categories={CATEGORIES} action={saveItem.bind(null, i.id)} />
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-line bg-white p-6 text-sm text-slate-500">まだ品目がありません</p>
      )}
    </div>
  );
}
