"use client";

import { useActionState } from "react";
import type { ExpState } from "./actions";

const input = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

/** 経費1件を直す（勘定科目・税率・お店・金額・日付） */
export function ExpenseEdit({
  e,
  titles,
  action,
}: {
  e: { amount: number; tax_rate: number | null; account_title: string | null; vendor: string | null; expense_date: string };
  titles: string[];
  action: (p: ExpState, fd: FormData) => Promise<ExpState>;
}) {
  const [state, act, pending] = useActionState(action, undefined);
  return (
    <form action={act} className="mt-2 grid gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-6">
      <input name="expense_date" type="date" defaultValue={e.expense_date} className={input} aria-label="日付" />
      <input name="amount" inputMode="numeric" defaultValue={e.amount} className={`${input} tabular-nums`} aria-label="金額" />
      <select name="tax_rate" defaultValue={String(e.tax_rate ?? 10)} className={input} aria-label="税率">
        <option value="10">10%</option>
        <option value="8">8%（軽減）</option>
        <option value="0">対象外</option>
      </select>
      <select name="account_title" defaultValue={e.account_title ?? ""} className={input} aria-label="勘定科目">
        <option value="">勘定科目を選ぶ</option>
        {titles.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <input name="vendor" defaultValue={e.vendor ?? ""} placeholder="お店・取引先" className={input} />
      <button disabled={pending} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "…" : "直す"}
      </button>
      {state?.ok && <p className="text-xs text-emerald-700 sm:col-span-6">{state.ok}</p>}
      {state?.error && <p className="text-xs text-accent sm:col-span-6">{state.error}</p>}
    </form>
  );
}
