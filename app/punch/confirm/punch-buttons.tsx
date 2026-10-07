"use client";

import { useActionState } from "react";
import type { PunchResult } from "./actions";

type Action = (prev: PunchResult, fd: FormData) => Promise<PunchResult>;

const BREAKS = [0, 15, 30, 45, 60, 90, 120];
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });

export function PunchButtons({
  statusLabel,
  mode,
  checkIn,
  checkOut,
}: {
  statusLabel: string;
  mode: "check_in" | "check_out";
  checkIn: Action;
  checkOut: Action;
}) {
  const [state, formAction, pending] = useActionState(mode === "check_in" ? checkIn : checkOut, undefined);

  if (state?.ok) {
    return (
      <div className="mt-6 rounded-md bg-emerald-50 p-5">
        <p className="text-2xl font-bold text-emerald-700">{state.action === "check_in" ? "出勤しました" : "退勤しました"}</p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-emerald-800">{hhmm(state.at)}</p>
        <p className="mt-3 text-xs text-emerald-700">この画面は閉じてかまいません</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <p className="pb-2 text-sm text-slate-500">{statusLabel}</p>
      {mode === "check_out" && (
        <label className="block text-left text-sm text-slate-600">
          実際に取った休憩
          <select name="break_minutes" defaultValue="0" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base">
            {BREAKS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "休憩なし" : `${m}分`}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`block w-full rounded-lg py-5 text-2xl font-bold text-white shadow-sm disabled:opacity-60 ${
          mode === "check_in" ? "bg-brand hover:bg-brand-2" : "bg-accent hover:bg-[#b8000a]"
        }`}
      >
        {pending ? "記録しています…" : mode === "check_in" ? "出勤する" : "退勤する"}
      </button>
      {state && !state.ok && <p className="text-sm font-bold text-accent">{state.error}</p>}
    </form>
  );
}
