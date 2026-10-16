"use client";

import { useActionState } from "react";
import type { BaselineState } from "./actions";

type Act = (prev: BaselineState, form: FormData) => Promise<BaselineState>;
const input = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm";

/** はじめの残高の入力（1人分） */
export function BaselineForm({ action, asOf, remaining, defaultDate }: { action: Act; asOf: string | null; remaining: number | null; defaultDate: string }) {
  const [state, act, pending] = useActionState(action, undefined);
  return (
    <form action={act} className="flex flex-wrap items-center gap-2">
      <input name="as_of" type="date" defaultValue={asOf ?? defaultDate} className={input} aria-label="この日の時点" />
      <span className="text-xs text-slate-500">の時点で残り</span>
      <input name="remaining" inputMode="decimal" defaultValue={remaining ?? ""} placeholder="—" className={`${input} w-16 text-right`} aria-label="残りの日数" />
      <span className="text-xs text-slate-500">日</span>
      <button disabled={pending} className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
        {pending ? "…" : "保存"}
      </button>
      {state?.ok && <span className="text-xs font-bold text-emerald-700">{state.ok}</span>}
      {state?.error && <span className="text-xs font-bold text-accent">{state.error}</span>}
    </form>
  );
}
