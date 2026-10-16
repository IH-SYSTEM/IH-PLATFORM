"use client";

import { useActionState } from "react";
import type { LeaveReviewState } from "../actions";

type Act = (prev: LeaveReviewState, form: FormData) => Promise<LeaveReviewState>;

/** 承認・却下のボタン（ひとことを添えられる） */
export function LeaveReviewButtons({ approve, reject }: { approve: Act; reject: Act }) {
  const [a, approveAct, aPending] = useActionState(approve, undefined);
  const [r, rejectAct, rPending] = useActionState(reject, undefined);
  const state = (a?.at ?? 0) > (r?.at ?? 0) ? a : r;
  const busy = aPending || rPending;
  return (
    <form className="space-y-3">
      <input name="note" maxLength={200} placeholder="本人へのひとこと（任意）" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      <div className="grid grid-cols-2 gap-3">
        <button formAction={approveAct} disabled={busy} className="w-full rounded-lg bg-brand py-4 text-lg font-bold text-white disabled:opacity-50">
          {aPending ? "…" : "承認する"}
        </button>
        <button
          formAction={rejectAct}
          disabled={busy}
          onClick={(e) => {
            if (!window.confirm("却下しますか？")) e.preventDefault();
          }}
          className="w-full rounded-lg border border-accent py-4 text-lg font-bold text-accent disabled:opacity-50"
        >
          {rPending ? "…" : "却下する"}
        </button>
      </div>
      {state?.ok && <p className="text-center text-sm font-bold text-emerald-700">{state.ok}</p>}
      {state?.error && <p className="text-center text-sm font-bold text-accent">{state.error}</p>}
    </form>
  );
}
