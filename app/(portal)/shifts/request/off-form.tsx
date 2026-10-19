"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { RequestState } from "./actions";

type Day = { date: string; label: string; weekend: boolean; closed: boolean };

/**
 * 正社員の休みの希望。店休日は最初から「店休」で、押せない。ほかの日を押すと「希望休」になる（上限まで）。
 * 上限を超えて休みたいときは有給で申請する
 */
export function OffRequestForm({ days, initial, limit, action }: { days: Day[]; initial: string[]; limit: number | null; action: (p: RequestState, fd: FormData) => Promise<RequestState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [off, setOff] = useState<Set<string>>(() => new Set(initial.filter((d) => days.some((x) => x.date === d && !x.closed))));
  const full = limit !== null && off.size >= limit;
  const toggle = (d: string) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d);
      else if (!full) n.add(d);
      return n;
    });
  const closedCount = days.filter((d) => d.closed).length;
  // 1日目の曜日に合わせて空きを入れる（カレンダーの形）
  const lead = new Date(`${days[0].date}T12:00:00Z`).getUTCDay();

  return (
    <form action={formAction} className="space-y-3">
      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
        店休日 <span className="font-bold">{closedCount}日</span>（自動で休み）＋ 希望休{" "}
        <span className={`font-bold ${full ? "text-accent" : "text-brand"}`}>
          {off.size}
          {limit !== null ? ` / ${limit}日` : "日"}
        </span>
      </p>
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
          const on = off.has(d.date);
          return (
            <button
              key={d.date}
              type="button"
              disabled={d.closed || (!on && full)}
              onClick={() => toggle(d.date)}
              className={`flex aspect-square flex-col items-center justify-center rounded-md border text-sm ${
                d.closed ? "border-slate-200 bg-slate-100 text-slate-400" : on ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-800 disabled:opacity-40"
              }`}
            >
              <span className="font-bold tabular-nums">{Number(d.date.slice(8, 10))}</span>
              <span className="text-[10px]">{d.closed ? "店休" : on ? "希望休" : ""}</span>
            </button>
          );
        })}
      </div>
      {[...off].map((d) => (
        <input key={d} type="hidden" name="off" value={d} />
      ))}
      {full && (
        <p className="text-xs text-slate-600">
          希望休は{limit}日までです。それより多く休みたいときは
          <Link href="/me/leave" className="mx-1 font-bold text-brand underline">
            有給で申請
          </Link>
          してください
        </p>
      )}
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      <button disabled={pending} className="block w-full rounded-lg bg-brand py-4 text-lg font-bold text-white hover:bg-brand-2 disabled:opacity-50">
        {pending ? "提出しています…" : "この休みの希望で提出する"}
      </button>
      {state?.ok && <Toast key={state.at} message="休みの希望を提出しました" />}
    </form>
  );
}
