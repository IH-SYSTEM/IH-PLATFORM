"use client";

import { useActionState } from "react";
import { updatePassword } from "./actions";

const inputClass =
  "block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          新しいパスワード（8文字以上）
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-sm font-medium text-slate-700">
          新しいパスワード（確認）
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "保存中…" : "パスワードを設定する"}
      </button>
    </form>
  );
}
