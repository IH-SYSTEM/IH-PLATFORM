"use client";

import { useActionState, useState, useTransition } from "react";
import { Toast } from "@/app/toast";
import { cancelLeave, requestLeave, type LeaveState } from "./actions";

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const DAY = 86_400_000;
const span = (s: string, e: string) => Math.round((Date.parse(e) - Date.parse(s)) / DAY) + 1;
const addMonths = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  const day = t.getUTCDate();
  t.setUTCDate(1);
  t.setUTCMonth(t.getUTCMonth() + n);
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
};
const deadline = (s: string, n: number) => (n >= 5 ? addMonths(s, -2) : n >= 2 ? addMonths(s, -1) : new Date(Date.parse(`${s}T12:00:00Z`) - 14 * DAY).toISOString().slice(0, 10));
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 有給の申請。日を選ぶと、申請の期限（1日＝2週間前、2〜4日＝1か月前、5日以上＝2か月前）をその場で見せる */
export function LeaveRequestForm({ today, minDate }: { today: string; minDate: string }) {
  const [state, act, pending] = useActionState(requestLeave, undefined as LeaveState);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const e = end && end >= start ? end : start;
  const n = start ? span(start, e) : 0;
  const due = start ? deadline(start, n) : null;
  return (
    <form action={act} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs font-bold text-slate-600">
          はじめの日
          <input name="start_date" type="date" required min={minDate} value={start} onChange={(ev) => setStart(ev.target.value)} className={input} />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-600">
          終わりの日（1日だけなら空）
          <input name="end_date" type="date" min={start || minDate} value={end} onChange={(ev) => setEnd(ev.target.value)} className={input} />
        </label>
      </div>
      {due && (
        <p className={`rounded-md px-3 py-2 text-xs ${today > due ? "bg-accent-soft/50 font-bold text-accent" : "bg-slate-50 text-slate-600"}`}>
          {n}日間の有給は、{md(due)}までに申請する決まりです
          {today > due ? "。期限を過ぎていますが、申請は出せます（店長の判断になります）" : ""}
        </p>
      )}
      <textarea name="reason" maxLength={300} rows={2} placeholder="理由・メモ（任意）" className={input} />
      <button disabled={pending} className="w-full rounded-lg bg-brand py-3 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "送信中…" : "有給を申請する"}
      </button>
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      {state?.ok && <Toast key={state.at} message={state.ok} />}
    </form>
  );
}

export function CancelLeaveButton({ id }: { id: string }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<LeaveState>();
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (!window.confirm("この申請を取り消しますか？")) return;
          start(async () => setMsg(await cancelLeave(id)));
        }}
        className="rounded-full px-3 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200 hover:text-accent disabled:opacity-50"
      >
        取り消す
      </button>
      {msg?.error && <span className="text-xs font-bold text-accent">{msg.error}</span>}
    </>
  );
}
