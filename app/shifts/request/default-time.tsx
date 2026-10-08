"use client";

import { useActionState } from "react";
import { Toast } from "@/app/toast";
import type { RequestState } from "./actions";

/** 「いつもの時間」。希望を出すとき、選んだ日に最初から入る時間 */
export function DefaultTime({ start, end, action }: { start: string; end: string; action: (p: RequestState, fd: FormData) => Promise<RequestState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-white px-3 py-2.5 text-sm">
      <span className="font-bold text-slate-700">いつもの時間</span>
      <input type="time" name="start" defaultValue={start} className="rounded-md border border-slate-300 px-2 py-1" />
      〜
      <input type="time" name="end" defaultValue={end} className="rounded-md border border-slate-300 px-2 py-1" />
      <button disabled={pending} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:border-brand">
        {pending ? "保存中…" : "保存"}
      </button>
      <span className="w-full text-xs text-slate-400">希望を出す日を選ぶと、この時間が最初から入ります（日ごとに変えられます）</span>
      {state?.error && <span className="w-full text-xs font-bold text-accent">{state.error}</span>}
      {state?.ok && <Toast key={state.at} message="いつもの時間を保存しました" />}
    </form>
  );
}
