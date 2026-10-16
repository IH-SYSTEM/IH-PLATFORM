"use client";

import { useActionState } from "react";
import type { ReviewState } from "../actions";

type Act = (prev: ReviewState) => Promise<ReviewState>;

/** 承認・却下のボタン（大きく押しやすく） */
export function ReviewButtons({ approve, reject }: { approve: Act; reject: Act }) {
  const [a, approveAct, aPending] = useActionState(approve, undefined);
  const [r, rejectAct, rPending] = useActionState(reject, undefined);
  const state = (a?.at ?? 0) > (r?.at ?? 0) ? a : r;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <form action={approveAct}>
          <button disabled={aPending || rPending} className="w-full rounded-lg bg-brand py-4 text-lg font-bold text-white disabled:opacity-50">
            {aPending ? "…" : "承認する"}
          </button>
        </form>
        <form
          action={rejectAct}
          onSubmit={(e) => {
            if (!window.confirm("却下しますか？")) e.preventDefault();
          }}
        >
          <button disabled={aPending || rPending} className="w-full rounded-lg border border-accent py-4 text-lg font-bold text-accent disabled:opacity-50">
            {rPending ? "…" : "却下する"}
          </button>
        </form>
      </div>
      {state?.ok && <p className="text-center text-sm font-bold text-emerald-700">{state.ok}</p>}
      {state?.error && <p className="text-center text-sm font-bold text-accent">{state.error}</p>}
    </div>
  );
}
