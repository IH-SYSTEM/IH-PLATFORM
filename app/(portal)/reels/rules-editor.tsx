"use client";

import { useState, useTransition } from "react";
import { addRule, deleteRule, setRuleActive } from "./actions";

/** わたしの編集ルール：作るたびに AI がこのルールを守って編集する */
export function RulesEditor({ rules }: { rules: { id: string; body: string; is_active: boolean }[] }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const r = await addRule(text);
      if ("error" in r && r.error) setMsg(r.error);
      else {
        setText("");
        setMsg(null);
      }
    });

  return (
    <section className="space-y-2 rounded-md border border-line bg-white p-4">
      <div>
        <h2 className="text-sm font-bold text-slate-800">わたしの編集ルール</h2>
        <p className="text-xs text-slate-500">作るたびに、AI がこのルールを守って編集します。「使う」を外すと、消さずに止められます</p>
      </div>
      {rules.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {rules.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 py-2 text-sm ${r.is_active ? "text-slate-800" : "text-slate-400 line-through"}`}>
              <span className="min-w-0 flex-1">{r.body}</span>
              <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600 no-underline">
                <input type="checkbox" checked={r.is_active} disabled={pending} onChange={(e) => start(async () => void (await setRuleActive(r.id, e.target.checked)))} />
                使う
              </label>
              <button disabled={pending} onClick={() => confirm("このルールを消しますか？") && start(async () => void (await deleteRule(r.id)))} className="shrink-0 text-xs text-slate-400 hover:text-accent">
                消す
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && text.trim() && add()}
          maxLength={200}
          placeholder="例：最後は店の外観で終わる"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button onClick={add} disabled={pending || !text.trim()} className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          足す
        </button>
      </div>
      {msg && <p className="text-xs text-accent">{msg}</p>}
    </section>
  );
}
