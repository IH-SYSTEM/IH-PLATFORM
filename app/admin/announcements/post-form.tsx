"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { PostState } from "./actions";

type Option = { id: string; name: string };
const input = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

export function PostForm({ companies, stores, action }: { companies: Option[]; stores: Option[]; action: (p: PostState, fd: FormData) => Promise<PostState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [kind, setKind] = useState("notice");
  const [audience, setAudience] = useState("all");

  return (
    <form action={formAction} key={state?.ok ? state.at : "form"} className="space-y-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {[
          ["notice", "会社からのお知らせ"],
          ["system", "システムの更新"],
          ["news", "全国ニュース"],
        ].map(([v, l]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="peer sr-only" />
            <span className="block rounded-full px-4 py-1.5 text-sm font-bold ring-1 ring-slate-200 peer-checked:bg-brand peer-checked:text-white peer-checked:ring-brand">{l}</span>
          </label>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">タイトル（100文字まで）</span>
        <input name="title" maxLength={100} required className={input} placeholder={kind === "news" ? "例：最低賃金が全国平均で過去最大の引き上げ" : "例：年末年始の営業について"} />
      </label>
      {kind === "news" ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">記事のリンク（https://〜）</span>
            <input name="url" type="url" required className={input} placeholder="https://" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">出どころ</span>
            <input name="source" maxLength={50} className={input} placeholder="例：NHK" />
          </label>
        </div>
      ) : (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">リンク（任意）</span>
          <input name="url" type="url" className={input} placeholder="https://" />
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">{kind === "news" ? "ひとこと（なぜ読んでほしいか。任意）" : "本文（2000文字まで）"}</span>
        <textarea name="body" maxLength={2000} rows={kind === "news" ? 2 : 5} className={input} />
      </label>
      <div className="space-y-2">
        <span className="text-xs font-medium text-slate-600">出す相手</span>
        <div className="flex flex-wrap gap-4 text-sm">
          {[
            ["all", "全員"],
            ["company", "会社を選ぶ"],
            ["store", "店舗を選ぶ"],
          ].map(([v, l]) => (
            <label key={v} className="flex items-center gap-1.5">
              <input type="radio" name="audience" value={v} checked={audience === v} onChange={() => setAudience(v)} />
              {l}
            </label>
          ))}
        </div>
        {audience !== "all" && (
          <div className="flex flex-wrap gap-3 rounded-md bg-slate-50 p-3 text-sm">
            {(audience === "company" ? companies : stores).map((o) => (
              <label key={o.id} className="flex items-center gap-1.5">
                <input type="checkbox" name={audience === "company" ? "company_ids" : "store_ids"} value={o.id} />
                {o.name}
              </label>
            ))}
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="pinned" className="size-4" />
        一番上に固定する
      </label>
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      <button disabled={pending} className="rounded-lg bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-2 disabled:opacity-60">
        {pending ? "載せています…" : "ホームに載せる"}
      </button>
      {state?.ok && <Toast key={state.at} message="ホームに載せました" />}
    </form>
  );
}
