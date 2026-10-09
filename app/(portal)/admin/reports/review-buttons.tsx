"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { ReviewState } from "./actions";

export function ReviewButtons({
  approveLabel,
  approve,
  reject,
}: {
  approveLabel: string;
  approve: (prev: ReviewState) => Promise<ReviewState>;
  reject: (prev: ReviewState, fd: FormData) => Promise<ReviewState>;
}) {
  const [aState, approveAction, approving] = useActionState(approve, undefined);
  const [rState, rejectAction, rejecting] = useActionState(reject, undefined);
  const [showReject, setShowReject] = useState(false);
  const state = rState?.at && (!aState?.at || rState.at > aState.at) ? rState : aState;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={approveAction}>
          <button disabled={approving || rejecting} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-2 disabled:opacity-60">
            {approving ? "処理しています…" : approveLabel}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setShowReject((v) => !v)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-accent hover:text-accent"
        >
          却下
        </button>
      </div>
      {showReject && (
        <form action={rejectAction} className="flex flex-wrap gap-2">
          <input name="note" maxLength={200} required placeholder="却下の理由（報告者に届きます）" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={rejecting} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            {rejecting ? "送信中…" : "却下する"}
          </button>
        </form>
      )}
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      {state?.ok && <Toast key={state.at} message={state.ok} />}
    </div>
  );
}
