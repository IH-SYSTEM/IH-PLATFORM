"use client";

import { useActionState, useState } from "react";
import type { LinkState } from "./actions";

export function PasswordLinkPanel({ action }: { action: () => Promise<LinkState> }) {
  const [state, issue, pending] = useActionState<LinkState>(action, undefined);
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">パスワード設定リンク</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        新しく登録したスタッフや、パスワードを忘れたスタッフに渡すリンクです。1回だけ使えます。
      </p>
      <form action={issue} className="mt-3">
        <button disabled={pending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {pending ? "発行中…" : "リンクを発行する"}
        </button>
      </form>
      {state?.error && <p className="mt-3 text-sm text-rose-600">{state.error}</p>}
      {state?.url && (
        <div className="mt-3 flex gap-2">
          <input readOnly value={state.url} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600" />
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(state.url!);
              setCopied(true);
            }}
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            {copied ? "コピー済み" : "コピー"}
          </button>
        </div>
      )}
    </div>
  );
}
