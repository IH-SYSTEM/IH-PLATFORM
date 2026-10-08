"use client";

import { useActionState, useState } from "react";
import type { WageState } from "./wage-actions";

export type WageHistoryRow = { id: string; valid_from: string; valid_to: string | null; employment_type: string; amount: number; note: string | null; by: string | null };

const LABEL: Record<string, string> = { monthly: "月給", daily: "日給", hourly: "時給", contract: "業務委託" };
const ymd = (d: string) => `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

/** 給与設定の履歴（いつから・いつまで・いくら）。終わりの日がない行が今の設定 */
export function WageHistory({
  rows,
  today,
  add,
  removeLatest,
}: {
  rows: WageHistoryRow[];
  today: string;
  add: (p: WageState, fd: FormData) => Promise<WageState>;
  removeLatest: () => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(add, undefined);
  const [open, setOpen] = useState(false);
  const current = rows.find((r) => !r.valid_to);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">給与設定の履歴</h2>
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-2">
          ＋ 金額を変える
        </button>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">勤怠から取り込むときは、日ごとにその日の金額で計算します（月の途中で変わっても分けて計算）</p>

      {open && (
        <form action={formAction} key={state?.ok ? state.at : "f"} className="mt-4 grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-[10rem_8rem_9rem_1fr_auto] sm:items-end">
          <label className="space-y-1">
            <span className="block text-xs text-slate-600">いつから</span>
            <input name="valid_from" type="date" required className={`w-full ${input}`} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-slate-600">給与の形</span>
            <select name="employment_type" defaultValue={current?.employment_type ?? "hourly"} className={`w-full ${input}`}>
              {Object.entries(LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-slate-600">金額（円）</span>
            <input name="amount" inputMode="numeric" required className={`w-full ${input}`} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-slate-600">理由（任意）</span>
            <input name="note" maxLength={200} placeholder="例：昇給、最低賃金の改定" className={`w-full ${input}`} />
          </label>
          <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            {pending ? "保存中…" : "保存"}
          </button>
          {state?.error && <p className="text-sm font-bold text-accent sm:col-span-5">{state.error}</p>}
        </form>
      )}

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-2 font-medium">期間</th>
            <th className="py-2 font-medium">給与の形</th>
            <th className="py-2 text-right font-medium">金額</th>
            <th className="py-2 pl-4 font-medium">理由・変えた人</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={r.id} className={!r.valid_to ? "font-bold" : "text-slate-600"}>
              <td className="py-2 tabular-nums">
                {ymd(r.valid_from)}〜{r.valid_to ? ymd(r.valid_to) : ""}
                {!r.valid_to && <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[10px] text-white">{r.valid_from > today ? "予定" : "現行"}</span>}
              </td>
              <td className="py-2">{LABEL[r.employment_type] ?? r.employment_type}</td>
              <td className="py-2 text-right tabular-nums">{r.amount.toLocaleString()}円</td>
              <td className="py-2 pl-4 text-xs font-normal text-slate-500">
                {[r.note, r.by].filter(Boolean).join("・")}
              </td>
              <td className="py-2 text-right">
                {i === 0 && (
                  <form
                    action={removeLatest}
                    onSubmit={(e) => {
                      if (!confirm("この行を消して、1つ前の設定に戻しますか？")) e.preventDefault();
                    }}
                  >
                    <button className="text-xs font-normal text-slate-400 hover:text-accent">消す</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-slate-400">
                まだありません（給与マスタの金額で計算します）
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
