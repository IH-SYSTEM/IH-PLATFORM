"use client";

import { useActionState, useState, useTransition } from "react";
import { Toast } from "@/app/toast";
import { cancelLeave, requestLeave, type LeaveState } from "./actions";

const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T12:00:00Z`);
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const span = (s: string, e: string) => Math.round((at(e) - at(s)) / DAY) + 1;
const addMonths = (d: string, n: number) => {
  const t = new Date(at(d));
  const day = t.getUTCDate();
  t.setUTCDate(1);
  t.setUTCMonth(t.getUTCMonth() + n);
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
};
// 申請の期限：1日＝2週間前、連続2〜4日＝1か月前、連続5日以上＝2か月前
const deadline = (s: string, n: number) => (n >= 5 ? addMonths(s, -2) : n >= 2 ? addMonths(s, -1) : ymd(at(s) - 14 * DAY));
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const monthDays = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
};
const shiftMonth = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

/**
 * 有給の申請（カレンダー）。1回押すとその日、続けて別の日を押すと、その間の連続した日になる。もう一度押すとやり直し。
 * 申請の期限を過ぎた日・期間は選べず、押すと「期限外です」と出る（期限は日数で変わる）
 */
export function LeaveRequestForm({ today }: { today: string; minDate?: string }) {
  const [state, act, pending] = useActionState(requestLeave, undefined as LeaveState);
  const [month, setMonth] = useState(addMonths(today, 1).slice(0, 7));
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const days = monthDays(month);
  const lead = new Date(at(days[0])).getUTCDay();
  const firstMonth = today.slice(0, 7);
  const lastMonth = shiftMonth(firstMonth, 6);

  const tap = (d: string) => {
    setWarn(null);
    if (d <= today) return setWarn("今日より後の日を選んでください");
    // 1日だけでも期限を過ぎている日
    if (today > deadline(d, 1)) return setWarn(`期限外です。${md(d)} の有給は ${md(deadline(d, 1))} までに申請する決まりです。急ぎのときは店長に相談してください`);
    if (!start || end || d < start) {
      setStart(d);
      setEnd(null);
      return;
    }
    if (d === start) return setStart(null);
    const n = span(start, d);
    if (n > 60) return setWarn("一度に申請できるのは60日までです");
    if (today > deadline(start, n)) return setWarn(`期限外です。${n}日間の有給は ${md(deadline(start, n))} までに申請する決まりです`);
    setEnd(d);
  };
  const s = start;
  const e = end ?? start;
  const n = s && e ? span(s, e) : 0;
  const inRange = (d: string) => !!s && !!e && d >= s && d <= e;

  return (
    <form action={act} className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" disabled={month <= firstMonth} onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          ‹ 前の月
        </button>
        <span className="font-bold text-slate-800">
          {month.slice(0, 4)}年{Number(month.slice(5))}月
        </span>
        <button type="button" disabled={month >= lastMonth} onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          次の月 ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {"日月火水木金土".split("").map((w, i) => (
          <span key={w} className={`py-1 font-bold ${i === 0 || i === 6 ? "text-accent" : "text-slate-500"}`}>
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {days.map((d) => {
          const past = d <= today;
          const expired = !past && today > deadline(d, 1);
          const on = inRange(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => tap(d)}
              className={`flex aspect-square flex-col items-center justify-center rounded-md border text-sm ${
                on ? "border-brand bg-brand text-white" : past ? "border-transparent text-slate-300" : expired ? "border-slate-200 bg-slate-100 text-slate-400" : "border-slate-200 bg-white text-slate-800"
              }`}
            >
              <span className="font-bold tabular-nums">{Number(d.slice(8, 10))}</span>
              <span className="text-[10px]">{on ? "有給" : expired ? "期限外" : ""}</span>
            </button>
          );
        })}
      </div>
      {warn && <p className="rounded-md bg-accent-soft/50 px-3 py-2 text-sm font-bold text-accent">{warn}</p>}
      {s && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <b>
            {md(s)}
            {e && e !== s ? `〜${md(e)}` : ""}（{n}日間）
          </b>
          　{n}日間の有給の申請期限は {md(deadline(s, n))} です。{!end && "続けて終わりの日を押すと、連続した日になります"}
        </p>
      )}
      <input type="hidden" name="start_date" value={s ?? ""} />
      <input type="hidden" name="end_date" value={e ?? ""} />
      <textarea name="reason" maxLength={300} rows={2} placeholder="理由・メモ（任意）" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      <button disabled={pending || !s} className="w-full rounded-lg bg-brand py-3 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "送信中…" : s ? `${n}日間の有給を申請する` : "カレンダーで日を選んでください"}
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
