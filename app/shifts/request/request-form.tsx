"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { RequestState } from "./actions";

type Choice = { a: string; s: string; e: string };
type Day = { date: string; label: string; weekend: boolean };

const OPTIONS = [
  { key: "all", label: "○ 終日OK", on: "bg-emerald-600 text-white" },
  { key: "partial", label: "◇ 時間", on: "bg-brand text-white" },
  { key: "off", label: "× 休み", on: "bg-slate-500 text-white" },
] as const;

export function RequestForm({ days, initial, action }: { days: Day[]; initial: Record<string, Choice>; action: (p: RequestState, fd: FormData) => Promise<RequestState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [values, setValues] = useState<Record<string, Choice>>(() => Object.fromEntries(days.map((d) => [d.date, initial[d.date] ?? { a: "", s: "19:00", e: "00:00" }])));
  const set = (date: string, patch: Partial<Choice>) => setValues((v) => ({ ...v, [date]: { ...v[date], ...patch } }));
  const setAll = (a: string) => setValues((v) => Object.fromEntries(days.map((d) => [d.date, { ...v[d.date], a }])));
  const unset = days.filter((d) => !values[d.date].a).length;

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex gap-2 text-xs">
        <span className="self-center text-slate-500">まとめて：</span>
        <button type="button" onClick={() => setAll("all")} className="rounded-full border border-slate-300 bg-white px-3 py-1 font-medium">
          全部○
        </button>
        <button type="button" onClick={() => setAll("off")} className="rounded-full border border-slate-300 bg-white px-3 py-1 font-medium">
          全部×
        </button>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
        {days.map((d) => {
          const v = values[d.date];
          return (
            <li key={d.date} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`w-20 text-sm font-bold ${d.weekend ? "text-accent" : "text-slate-800"}`}>{d.label}</span>
                <div className="flex gap-1">
                  {OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => set(d.date, { a: o.key })}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${v.a === o.key ? o.on : "bg-slate-100 text-slate-500"}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {v.a === "partial" && (
                <div className="mt-2 flex items-center justify-end gap-2 text-sm">
                  <input type="time" value={v.s} onChange={(e) => set(d.date, { s: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1" />
                  〜
                  <input type="time" value={v.e} onChange={(e) => set(d.date, { e: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1" />
                </div>
              )}
              <input type="hidden" name={`a:${d.date}`} value={v.a} />
              <input type="hidden" name={`s:${d.date}`} value={v.s} />
              <input type="hidden" name={`e:${d.date}`} value={v.e} />
            </li>
          );
        })}
      </ul>

      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      <button disabled={pending || unset > 0} className="block w-full rounded-lg bg-brand py-4 text-lg font-bold text-white hover:bg-brand-2 disabled:opacity-50">
        {pending ? "提出しています…" : unset > 0 ? `あと${unset}日、希望を選んでください` : "この内容で提出する"}
      </button>
      {state?.ok && <Toast key={state.at} message="シフト希望を提出しました" />}
    </form>
  );
}
