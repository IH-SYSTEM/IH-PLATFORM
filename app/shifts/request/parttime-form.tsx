"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { RequestState } from "./actions";

type Day = { date: string; label: string; weekend: boolean };
type Pick = { on: boolean; s: string; e: string; urgent?: boolean };

/** アルバイトの希望：入れる日を押すと「いつもの時間」が入る。選ばなかった日は入れない日 */
export function PartTimeForm({
  days,
  initial,
  defaults,
  action,
}: {
  days: Day[];
  initial: Record<string, { s: string; e: string; urgent: boolean }>;
  defaults: { start: string; end: string };
  action: (p: RequestState, fd: FormData) => Promise<RequestState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [picks, setPicks] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(days.map((d) => [d.date, initial[d.date] ? { on: true, ...initial[d.date] } : { on: false, s: defaults.start, e: defaults.end }])),
  );
  const set = (date: string, patch: Partial<Pick>) => setPicks((v) => ({ ...v, [date]: { ...v[date], ...patch } }));
  const count = days.filter((d) => picks[d.date].on).length;

  return (
    <form action={formAction} className="space-y-3">
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
        {days.map((d) => {
          const p = picks[d.date];
          return (
            <li key={d.date} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${p.on ? "bg-brand-soft" : ""}`}>
              <button
                type="button"
                onClick={() => set(d.date, { on: !p.on })}
                className={`w-28 rounded-md py-2 text-left text-sm font-bold ${p.on ? "text-brand" : d.weekend ? "text-accent" : "text-slate-700"}`}
              >
                <span className={`mr-2 inline-block size-4 rounded border align-middle ${p.on ? "border-brand bg-brand" : "border-slate-300 bg-white"}`} />
                {d.label}
              </button>
              {p.on ? (
                <div className="flex items-center gap-2 text-sm">
                  <input type="time" value={p.s} onChange={(e) => set(d.date, { s: e.target.value })} className="rounded-md border border-slate-300 bg-white px-2 py-1" />
                  〜
                  <input type="time" value={p.e} onChange={(e) => set(d.date, { e: e.target.value })} className="rounded-md border border-slate-300 bg-white px-2 py-1" />
                  {p.urgent && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">急募に応募</span>}
                </div>
              ) : (
                <span className="text-xs text-slate-400">入れない</span>
              )}
              <input type="hidden" name={`on:${d.date}`} value={p.on ? "1" : ""} />
              <input type="hidden" name={`s:${d.date}`} value={p.s} />
              <input type="hidden" name={`e:${d.date}`} value={p.e} />
            </li>
          );
        })}
      </ul>
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      <button disabled={pending} className="block w-full rounded-lg bg-brand py-4 text-lg font-bold text-white hover:bg-brand-2 disabled:opacity-50">
        {pending ? "提出しています…" : count ? `${count}日分の希望を出す` : "この週は入れない（0日で提出）"}
      </button>
      {state?.ok && <Toast key={state.at} message="シフト希望を出しました" />}
    </form>
  );
}
