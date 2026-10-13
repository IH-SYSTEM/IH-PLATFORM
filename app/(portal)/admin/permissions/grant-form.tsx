"use client";

import { useActionState } from "react";
import { Toast } from "@/app/toast";
import type { GrantState } from "./actions";

type Opt = { key: string; label: string };

/** 1つの機能の「はじめの設定」（自動で付く階層・立場・担当）。変えられない人には見るだけで出す */
export function GrantForm({
  ranks,
  positions,
  duties,
  granted,
  editable,
  action,
}: {
  ranks: Opt[];
  positions: Opt[];
  duties: Opt[];
  granted: string[]; // "position:store" など
  editable: boolean;
  action: (p: GrantState, fd: FormData) => Promise<GrantState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const has = (k: string) => granted.includes(k);
  const box = "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ring-1 ring-slate-200";

  return (
    <form action={formAction} className="space-y-3">
      <fieldset disabled={!editable || pending} className="space-y-3">
        <div>
          <p className="text-xs font-medium text-slate-500">階層で（組織図の段。その段以上が使えます）</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {ranks.map((r) => (
              <label key={r.key} className={box}>
                <input type="checkbox" name="rank" value={r.key} defaultChecked={has(`rank:${r.key}`)} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">立場で</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {positions.map((p) => (
              <label key={p.key} className={box}>
                <input type="checkbox" name="position" value={p.key} defaultChecked={has(`position:${p.key}`)} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">担当で（管理者のときだけ効きます）</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {duties.map((d) => (
              <label key={d.key} className={box}>
                <input type="checkbox" name="duty" value={d.key} defaultChecked={has(`duty:${d.key}`)} />
                {d.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      {editable && (
        <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {pending ? "保存しています…" : "はじめの設定を保存する"}
        </button>
      )}
      {state?.ok && <Toast key={state.at} message={state.ok} />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </form>
  );
}
