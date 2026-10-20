"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { InvState } from "../actions";

type Row = { id: string; name: string; category: string; unit: string; opening: number; bought: number; expected: number; unitCost: number | null };
type Act = (prev: InvState, fd: FormData) => Promise<InvState>;

/** 棚卸し表。区分ごとに、期首・買った数・今の数（入れる）。「保存」は途中の棚卸し、「期首確定」は次の期間の期首にする */
export function CountForm({ rows, today, save, close }: { rows: Row[]; today: string; save: Act; close: Act }) {
  const [s, saveAct, saving] = useActionState(save, undefined);
  const [c, closeAct, closing] = useActionState(close, undefined);
  const state = (s?.at ?? 0) > (c?.at ?? 0) ? s : c;
  const [vals, setVals] = useState<Record<string, string>>({});
  const value = rows.reduce((a, r) => a + (Number(vals[r.id]) || 0) * (r.unitCost ?? 0), 0);
  const filled = rows.filter((r) => (vals[r.id] ?? "") !== "").length;
  const cats = [...new Set(rows.map((r) => r.category))];

  return (
    <form className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-slate-600">数えた日</span>
        <input type="date" name="counted_on" defaultValue={today} className="rounded-md border border-slate-300 px-2 py-1.5" />
      </label>
      {cats.map((cat) => (
        <section key={cat} className="overflow-hidden rounded-md border border-line bg-white">
          <h2 className="bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700">{cat}</h2>
          <ul className="divide-y divide-slate-100">
            {rows
              .filter((r) => r.category === cat)
              .map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-900">{r.name}</span>
                    <span className="text-xs text-slate-500">
                      期首 {r.opening}・買った {r.bought}（あるはず {r.expected}）{r.unit}
                    </span>
                  </span>
                  <input
                    name={`q:${r.id}`}
                    inputMode="decimal"
                    value={vals[r.id] ?? ""}
                    onChange={(e) => setVals((v) => ({ ...v, [r.id]: e.target.value }))}
                    placeholder="—"
                    className="w-20 rounded-md border border-slate-300 px-2 py-2 text-right text-base tabular-nums"
                  />
                  <span className="w-10 text-xs text-slate-500">{r.unit}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <div className="sticky bottom-0 space-y-2 border-t border-line bg-white/95 py-3 backdrop-blur">
        <p className="text-sm text-slate-700">
          入れた品目 <b>{filled}</b> / {rows.length}・在庫の金額 <b className="tabular-nums">{Math.round(value).toLocaleString()}円</b>
          <span className="ml-1 text-xs text-slate-400">（空の品目は数えなかった扱い）</span>
        </p>
        <div className="flex gap-2">
          <button formAction={saveAct} disabled={saving || closing} className="flex-1 rounded-lg bg-brand py-3 font-bold text-white disabled:opacity-50">
            {saving ? "…" : "保存（途中の棚卸し）"}
          </button>
          <button
            formAction={closeAct}
            disabled={saving || closing}
            onClick={(e) => {
              if (!window.confirm("この日の在庫で期首確定しますか？次の期間の期首になります（元に戻せません）")) e.preventDefault();
            }}
            className="rounded-lg border border-accent px-4 py-3 font-bold text-accent disabled:opacity-50"
          >
            {closing ? "…" : "期首確定"}
          </button>
        </div>
        {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
        {state?.ok && <Toast key={state.at} message={state.ok} />}
      </div>
    </form>
  );
}
