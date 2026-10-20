import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { inventoryStatus, inventoryStores, todayJST } from "@/lib/inventory";
import { saveCount } from "../actions";
import { CountForm } from "./count-form";

export const metadata = { title: "棚卸し" };

/** 棚卸し表：期首に残っていた品目と、この期間に買った品目。いつでも数えて保存できる */
export default async function CountPage({ searchParams }: PageProps<"/inventory/count">) {
  const me = await requireStaff();
  const stores = await inventoryStores(me);
  const { store: sp } = await searchParams;
  const store = stores.find((s) => s.id === sp);
  if (!store) redirect("/inventory");
  const st = await inventoryStatus(store.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/inventory?store=${store.id}`} className="text-sm text-slate-500">
        ‹ 棚卸しシステム
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">{store.name}の棚卸し</h1>
      <p className="text-sm text-slate-500">
        今の期間は {st.period.start_date} から。期首に残っていたものと、この期間に買ったものが並びます。数えた数を入れてください
      </p>
      {st.rows.length ? (
        <CountForm
          rows={st.rows.map((r) => ({ id: r.item.id, name: r.item.name, category: r.item.category, unit: r.item.count_unit, opening: r.opening, bought: r.bought, expected: r.expected, unitCost: r.unitCost }))}
          today={todayJST()}
          save={saveCount.bind(null, store.id, false)}
          close={saveCount.bind(null, store.id, true)}
        />
      ) : (
        <p className="rounded-md border border-line bg-white p-6 text-sm text-slate-600">
          まだ品目がありません。納品伝票を取り込むと、買ったものが品目になり、ここに並びます
        </p>
      )}
    </div>
  );
}
