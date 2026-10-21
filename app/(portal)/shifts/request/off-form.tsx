"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { RequestState } from "./actions";

type Day = { date: string; label: string; weekend: boolean; closed: boolean; busy: boolean };
type Firm = "fixed" | "flexible";

/**
 * 正社員の休みの希望。店休日は最初から「店休」で押せない。繁忙日は出勤が必須で押せない（出せる人を除く）。
 * ほかの日を押すたびに「調整OK」→「動かせない」→ なし、と変わる。両方合わせて上限まで。上限を超えて休みたいときは有給で申請する
 */
export function OffRequestForm({ days, initial, limit, busyAllowed, action }: { days: Day[]; initial: Record<string, Firm>; limit: number | null; busyAllowed: boolean; action: (p: RequestState, fd: FormData) => Promise<RequestState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [off, setOff] = useState<Record<string, Firm>>(() =>
    Object.fromEntries(Object.entries(initial).filter(([d]) => days.some((x) => x.date === d && !x.closed && (busyAllowed || !x.busy)))),
  );
  const count = Object.keys(off).length;
  const full = limit !== null && count >= limit;
  const toggle = (d: string) =>
    setOff((s) => {
      const n = { ...s };
      if (n[d] === "flexible") n[d] = "fixed";
      else if (n[d] === "fixed") delete n[d];
      else if (!full) n[d] = "flexible";
      return n;
    });
  const closedCount = days.filter((d) => d.closed).length;
  const lead = new Date(`${days[0].date}T12:00:00Z`).getUTCDay();

  return (
    <form action={formAction} className="space-y-3">
      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
        店休日 <span className="font-bold">{closedCount}日</span>（自動で休み）＋ 希望休{" "}
        <span className={`font-bold ${full ? "text-accent" : "text-brand"}`}>
          {count}
          {limit !== null ? ` / ${limit}日` : "日"}
        </span>
      </p>
      <p className="text-xs text-slate-500">
        1回押すと<span className="mx-0.5 rounded bg-brand px-1 font-bold text-white">紺：調整OK</span>（予約しだいで出勤になることがある）、2回で
        <span className="mx-0.5 rounded bg-accent px-1 font-bold text-white">赤：動かせない</span>、3回で取り消し。
        {!busyAllowed && "「繁忙」の日は出勤が必須なので選べません。"}
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
          const f = off[d.date];
          const locked = d.closed || (d.busy && !busyAllowed);
          return (
            <button
              key={d.date}
              type="button"
              disabled={locked || (!f && full)}
              onClick={() => toggle(d.date)}
              className={`flex aspect-square flex-col items-center justify-center rounded-md border text-sm ${
                d.closed
                  ? "border-slate-200 bg-slate-100 text-slate-400"
                  : f === "fixed"
                    ? "border-accent bg-accent text-white"
                    : f === "flexible"
                      ? "border-brand bg-brand text-white"
                      : d.busy && !busyAllowed
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-white text-slate-800 disabled:opacity-40"
              }`}
            >
              <span className="font-bold tabular-nums">{Number(d.date.slice(8, 10))}</span>
              <span className="text-[10px]">{d.closed ? "店休" : f === "fixed" ? "動かせない" : f === "flexible" ? "調整OK" : d.busy ? "繁忙" : ""}</span>
            </button>
          );
        })}
      </div>
      {Object.entries(off).map(([d, f]) => (
        <input key={d} type="hidden" name={f} value={d} />
      ))}
      {full && (
        <p className="text-xs text-slate-600">
          この月の希望休は{limit}日までです。それより多く休みたいときは
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
