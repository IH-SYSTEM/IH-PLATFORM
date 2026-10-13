"use client";

import { useState, useTransition } from "react";
import { Toast } from "@/app/toast";
import type { GrantState } from "../actions";

type Row = { key: string; label: string; description: string; on: boolean; auto: boolean; autoReason: string | null; override: boolean | null };

/** 人ごとの機能。付ける／外す、自動に戻す。自動で付く理由も出す */
export function ModuleToggles({ rows, editable, set }: { rows: Row[]; editable: boolean; set: (module: string, mode: "on" | "off" | "auto") => Promise<GrantState> }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<GrantState>(undefined);
  const act = (module: string, mode: "on" | "off" | "auto") => start(async () => setState(await set(module, mode)));
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-bold text-slate-900">{r.label}</p>
            <p className="text-xs text-slate-500">{r.description}</p>
            <p className="mt-1 text-xs text-slate-500">
              {r.override === null
                ? r.auto
                  ? `自動で付いています（${r.autoReason}）`
                  : "付いていません"
                : r.override
                  ? "この人に個別に付けています"
                  : `この人だけ外しています${r.auto ? `（自動では付く：${r.autoReason}）` : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${r.on ? "bg-brand/10 text-brand ring-brand/40" : "text-slate-500 ring-slate-300"}`}>
              <input type="checkbox" checked={r.on} disabled={!editable || pending} onChange={(e) => act(r.key, e.target.checked ? "on" : "off")} className="size-4" />
              {r.on ? "使える" : "使えない"}
            </label>
            {editable && r.override !== null && (
              <button type="button" disabled={pending} onClick={() => act(r.key, "auto")} className="text-xs text-slate-500 underline disabled:opacity-50">
                自動に戻す
              </button>
            )}
          </div>
        </li>
      ))}
      {state?.ok && <Toast key={state.at} message={state.ok} />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </ul>
  );
}
