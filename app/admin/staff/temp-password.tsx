"use client";

import { useActionState } from "react";
import type { TempPasswordState } from "./actions";

/** 仮パスワードを決め直す。本人には口頭やLINEで伝え、最初のログインで本人のパスワードに変えてもらう */
export function TempPasswordPanel({ action }: { action: (p: TempPasswordState, fd: FormData) => Promise<TempPasswordState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">仮パスワード</h2>
      <p className="mt-0.5 text-xs text-slate-500">パスワードを忘れたスタッフに、新しい仮パスワードを決めて伝えてください。次のログインで本人が自分のパスワードに変えます。</p>
      <form action={formAction} key={state?.ok ? state.at : "form"} className="mt-3 flex flex-wrap gap-2">
        <input
          name="temp_password"
          type="text"
          minLength={8}
          required
          autoComplete="off"
          placeholder="8文字以上"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-2 disabled:opacity-60">
          {pending ? "設定中…" : "仮パスワードにする"}
        </button>
      </form>
      {state?.error && <p className="mt-3 text-sm text-accent">{state.error}</p>}
      {state?.ok && <p className="mt-3 text-sm font-bold text-emerald-700">設定しました。本人に伝えてください</p>}
    </div>
  );
}
