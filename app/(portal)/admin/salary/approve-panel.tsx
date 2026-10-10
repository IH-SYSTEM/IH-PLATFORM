"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { ApproveState } from "./actions";

/** 給与の承認（経理・承認の担当か代表）。確定と差し戻し。入力した本人には確定ボタンを出さない */
export function ApprovePanel({
  status,
  draftedBy,
  confirmedBy,
  selfDrafted,
  confirm,
  sendBack,
}: {
  status: "draft" | "confirmed";
  draftedBy: string | null;
  confirmedBy: string | null;
  selfDrafted: boolean;
  confirm: (prev: ApproveState) => Promise<ApproveState>;
  sendBack: (prev: ApproveState, fd: FormData) => Promise<ApproveState>;
}) {
  const [cState, cAction, cPending] = useActionState(confirm, undefined);
  const [rState, rAction, rPending] = useActionState(sendBack, undefined);
  const [open, setOpen] = useState(false);
  const state = cState?.at && (!rState?.at || cState.at > rState.at) ? cState : rState;

  return (
    <section className="rounded-md border border-brand/30 bg-brand-soft p-5">
      <h2 className="text-sm font-semibold text-slate-800">承認</h2>
      <p className="mt-1 text-sm text-slate-600">
        {status === "confirmed" ? `確定済み（確定：${confirmedBy ?? "—"}）` : `承認待ち（入力：${draftedBy ?? "—"}）`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {status === "draft" &&
          (selfDrafted ? (
            <p className="text-sm text-amber-700">自分で入力した給与は確定できません。ほかの承認の人に頼んでください</p>
          ) : (
            <form
              action={cAction}
              onSubmit={(e) => {
                if (!window.confirm("確定すると、本人の給与明細に出ます。確定しますか？")) e.preventDefault();
              }}
            >
              <button disabled={cPending} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {cPending ? "確定しています…" : "承認して確定する"}
              </button>
            </form>
          ))}
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
          差し戻す
        </button>
      </div>
      {open && (
        <form action={rAction} className="mt-3 space-y-2">
          <textarea name="reason" rows={2} required placeholder="直してほしいところ（入力した人に LINE で届きます）" className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={rPending} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {rPending ? "送っています…" : "差し戻して知らせる"}
          </button>
        </form>
      )}
      {state?.ok && <Toast key={state.at} message={state.ok} />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </section>
  );
}
