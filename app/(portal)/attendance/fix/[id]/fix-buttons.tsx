"use client";

import { useActionState } from "react";
import type { FixState } from "../actions";

type Act = (prev: FixState, fd: FormData) => Promise<FixState>;

/** 承認・却下（却下は理由が要る） */
export function FixButtons({ approve, reject }: { approve: Act; reject: Act }) {
  const [a, approveAct, aPending] = useActionState(approve, undefined);
  const [r, rejectAct, rPending] = useActionState(reject, undefined);
  const state = (a?.at ?? 0) > (r?.at ?? 0) ? a : r;
  const busy = aPending || rPending;
  if (a?.ok || r?.ok) return <p className="rounded-md bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-700">{a?.ok ?? r?.ok}</p>;
  return (
    <form className="space-y-3">
      <button formAction={approveAct} disabled={busy} className="w-full rounded-lg bg-brand py-4 text-lg font-bold text-white disabled:opacity-50">
        {aPending ? "…" : "承認して反映する"}
      </button>
      <div className="flex gap-2">
        <input name="note" maxLength={200} placeholder="却下するときの理由" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <button formAction={rejectAct} disabled={busy} className="shrink-0 rounded-lg border border-accent px-4 py-2 text-sm font-bold text-accent disabled:opacity-50">
          {rPending ? "…" : "却下"}
        </button>
      </div>
      {state?.error && <p className="text-center text-sm font-bold text-accent">{state.error}</p>}
    </form>
  );
}
