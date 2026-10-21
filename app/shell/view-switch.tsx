"use client";

import { useState, useTransition } from "react";
import { setViewAs } from "./view-as-actions";

type Mode = "parttime" | "fulltime" | "manager" | "";
const MODES: { value: Mode; label: string }[] = [
  { value: "", label: "管理者（いつもの表示）" },
  { value: "manager", label: "店長" },
  { value: "fulltime", label: "正社員" },
  { value: "parttime", label: "アルバイト" },
];

/** 表示の切り替え（代表だけ）。どの店の立場で見るかも選ぶ */
export function ViewSwitch({ current, storeId, stores, tone = "dark" }: { current: Mode; storeId: string | null; stores: { id: string; name: string }[]; tone?: "dark" | "light" }) {
  const [mode, setMode] = useState<Mode>(current);
  const [store, setStore] = useState(storeId ?? stores[0]?.id ?? "");
  const [busy, start] = useTransition();
  const sel = tone === "dark" ? "w-full rounded bg-white/10 px-2 py-1 text-xs text-white" : "rounded border border-slate-300 bg-white px-2 py-1 text-xs";
  return (
    <div className="space-y-1.5">
      <p className={`text-[10px] font-bold tracking-[0.2em] ${tone === "dark" ? "text-white/50" : "text-slate-500"}`}>表示の切り替え</p>
      <div className={tone === "dark" ? "space-y-1.5" : "flex flex-wrap items-center gap-1.5"}>
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className={sel} aria-label="表示">
          {MODES.map((m) => (
            <option key={m.value} value={m.value} className="text-slate-900">
              {m.label}
            </option>
          ))}
        </select>
        {mode !== "" && (
          <select value={store} onChange={(e) => setStore(e.target.value)} className={sel} aria-label="店">
            {stores.map((s) => (
              <option key={s.id} value={s.id} className="text-slate-900">
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => start(() => setViewAs(mode || null, mode ? store : null))}
          className={`rounded px-2 py-1 text-xs font-bold disabled:opacity-50 ${tone === "dark" ? "w-full bg-white text-brand" : "bg-brand text-white"}`}
        >
          {busy ? "…" : "切り替える"}
        </button>
      </div>
    </div>
  );
}
