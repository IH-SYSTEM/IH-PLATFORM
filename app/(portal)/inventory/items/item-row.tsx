"use client";

import { useActionState } from "react";
import type { InvState } from "../actions";

type Item = { id: string; name: string; category: string; count_unit: string; per_purchase: number; unit_cost: number | null; track: boolean; active: boolean; aliases: string[] };
const input = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";

/** 品目1つ（名前・区分・数える単位・仕入れ1単位の入り数・単価・数えるか・使うか） */
export function ItemRow({ item, categories, action }: { item: Item; categories: readonly string[]; action: (p: InvState, fd: FormData) => Promise<InvState> }) {
  const [state, act, pending] = useActionState(action, undefined);
  return (
    <form action={act} className={`grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_4.5rem_5rem_6rem_auto] sm:items-center ${item.active ? "" : "opacity-50"}`}>
      <div className="col-span-2 sm:col-span-1">
        <input name="name" defaultValue={item.name} className={`${input} w-full font-bold`} />
        {item.aliases.length > 0 && <p className="mt-0.5 truncate text-[11px] text-slate-400">伝票での書き方：{item.aliases.join("・")}</p>}
      </div>
      <select name="category" defaultValue={item.category} className={input} aria-label="区分">
        {categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <input name="count_unit" defaultValue={item.count_unit} className={input} aria-label="数える単位" title="数える単位" />
      <input name="per_purchase" defaultValue={item.per_purchase} inputMode="decimal" className={`${input} text-right`} aria-label="入り数" title="仕入れ1単位が、数える単位でいくつか（1ケース＝24本 なら 24）" />
      <input name="unit_cost" defaultValue={item.unit_cost ?? ""} inputMode="decimal" placeholder="単価" className={`${input} text-right`} aria-label="単価" title="数える単位あたりの単価（税込）" />
      <div className="col-span-2 flex flex-wrap items-center gap-3 text-xs sm:col-span-1">
        <label className="flex items-center gap-1">
          <input type="checkbox" name="track" defaultChecked={item.track} /> 数える
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="active" defaultChecked={item.active} /> 使う
        </label>
        <button disabled={pending} className="rounded-full bg-slate-800 px-3 py-1 font-bold text-white disabled:opacity-50">
          {pending ? "…" : "保存"}
        </button>
        {state?.ok && <span className="text-emerald-700">✓</span>}
        {state?.error && <span className="font-bold text-accent">{state.error}</span>}
      </div>
    </form>
  );
}
