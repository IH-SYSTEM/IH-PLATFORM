"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** ホームの「AI取説」入力欄。送ると AI取説の画面に移って、そのまま答えが出る */
export function AskBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = (text: string) => text.trim() && router.push(`/ai?q=${encodeURIComponent(text.trim())}`);
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={400}
          placeholder="使い方を聞く（例：打刻を忘れたらどうする？）"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
        <button disabled={!q.trim()} className="shrink-0 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          聞く
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["シフト希望の出し方", "携帯を忘れて打刻できない", "給与明細の見方"].map((s) => (
          <button key={s} type="button" onClick={() => go(s)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-brand hover:text-white">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
