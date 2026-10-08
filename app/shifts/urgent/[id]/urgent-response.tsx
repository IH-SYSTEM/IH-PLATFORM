"use client";

import { useActionState } from "react";
import type { UrgentState } from "../../urgent-actions";

export function UrgentResponse({ start, end, action }: { start: string; end: string; action: (p: UrgentState, fd: FormData) => Promise<UrgentState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  if (state?.ok) return <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{state.ok}</p>;
  return (
    <form action={formAction} className="mt-4 space-y-3">
      <p className="text-sm text-slate-600">入れる時間（一部だけでも応募できます）</p>
      <div className="flex items-center gap-2">
        <input type="time" name="start" defaultValue={start} className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
        〜
        <input type="time" name="end" defaultValue={end} className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
      </div>
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      <button disabled={pending} className="block w-full rounded-lg bg-accent py-4 text-lg font-bold text-white disabled:opacity-60">
        {pending ? "応募しています…" : "入れます（応募する）"}
      </button>
    </form>
  );
}
