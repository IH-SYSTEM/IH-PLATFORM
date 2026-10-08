"use client";

import { useActionState } from "react";
import { TEMP_PASSWORD } from "@/lib/staff";
import type { TempPasswordState } from "./actions";

/** パスワードを忘れた人を仮パスワードに戻す。次のログインで本人のパスワードに変えてもらう */
export function TempPasswordPanel({ action }: { action: () => Promise<TempPasswordState> }) {
  const [state, formAction, pending] = useActionState<TempPasswordState>(action, undefined);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">仮パスワードに戻す</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        パスワードを忘れたスタッフを、仮パスワード <span className="font-mono font-bold text-slate-700">{TEMP_PASSWORD}</span> に戻します。次のログインで本人が自分のパスワードに変えます。
      </p>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!confirm("このスタッフのパスワードを仮パスワードに戻しますか？")) e.preventDefault();
        }}
        className="mt-3"
      >
        <button disabled={pending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {pending ? "戻しています…" : "仮パスワードに戻す"}
        </button>
      </form>
      {state?.error && <p className="mt-3 text-sm text-accent">{state.error}</p>}
      {state?.ok && <p className="mt-3 text-sm font-bold text-emerald-700">仮パスワードに戻しました。本人に伝えてください</p>}
    </div>
  );
}
