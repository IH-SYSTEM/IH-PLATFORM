"use client";

import { useActionState } from "react";
import type { ImportState } from "./actions";

export function ImportForm({ stores, action }: { stores: { id: string; name: string }[]; action: (p: ImportState, fd: FormData) => Promise<ImportState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">店舗</span>
          <select name="store_id" required defaultValue="" className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="" disabled>
              選んでください
            </option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">エアレジの「会計明細」CSV</span>
          <input name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-bold" />
        </label>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        エアレジ → 売上・分析 → 日別売上 → 「CSVデータをダウンロードする」→「会計明細」。前月1日〜当日しか出せないので、少なくとも月1回（できれば週1回）取り込んでください。期間が重なっても二重にはなりません。
      </p>
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      {state?.ok && <p className="text-sm font-bold text-emerald-700">{state.ok}</p>}
      <button disabled={pending} className="rounded-lg bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-2 disabled:opacity-60">
        {pending ? "取り込んでいます…" : "取り込む"}
      </button>
    </form>
  );
}
