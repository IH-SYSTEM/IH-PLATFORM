"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { DisplayKeyState } from "../actions";

export function DisplayKeyPanel({
  code,
  url,
  issuedAt,
  action,
}: {
  code: string | null;
  url: string | null;
  issuedAt: string | null;
  action: (prev: DisplayKeyState) => Promise<DisplayKeyState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [copied, setCopied] = useState(false);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">打刻QRの掲示</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        店舗の iPad でこのURLを開きっぱなしにします。URLを知っている端末ならログインなしでQRを表示できるので、外部に共有しないでください
      </p>

      {!code ? (
        <p className="mt-4 text-sm text-slate-500">店舗コードを登録して保存すると、掲示用URLを発行できます</p>
      ) : (
        <div className="mt-4 space-y-3">
          {url ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{url}</code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand"
                >
                  {copied ? "コピーしました" : "コピー"}
                </button>
                <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand">
                  開く
                </a>
              </div>
              {issuedAt && <p className="text-xs text-slate-400">発行日時：{new Date(issuedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>}
            </>
          ) : (
            <p className="text-sm text-slate-500">まだ発行していません</p>
          )}
          <form
            action={formAction}
            onSubmit={(e) => {
              if (url && !confirm("再発行すると、今のURLを開いている iPad ではQRが表示されなくなります。再発行しますか？")) e.preventDefault();
            }}
          >
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:opacity-60"
            >
              {pending ? "発行中…" : url ? "URLを再発行する" : "掲示用URLを発行する"}
            </button>
          </form>
        </div>
      )}

      {state?.ok && <Toast key={state.at} message="掲示用URLを発行しました" />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </section>
  );
}
