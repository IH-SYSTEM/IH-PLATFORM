"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RichText } from "./rich-text";

type Turn = { role: "user" | "assistant"; content: string };

/** 答えの最後の分析用の行（[[META]]…）は画面に出さない。流れてくる途中の書きかけも隠す */
const visible = (text: string) => text.split("[[META")[0].replace(/\[\[?M?E?T?A?$/, "").trimEnd();
type Mode = "guide" | "sparring";

const SUGGEST: Record<Mode, string[]> = {
  guide: ["打刻を忘れたらどうする？", "シフト希望はいつまでに出す？", "給与明細はどこで見る？", "パスワードを忘れた"],
  sparring: ["今の数字を見て、いちばん気になる店は？", "obanzai の次の一手を一緒に考えたい", "この案はコンセプトとぶつからない？"],
};

/** AI取説（全員）／壁打ち（代表だけ）。会話はこの画面の中だけで持つ（ページを離れると消える） */
export function Chat({ canSpar, initial }: { canSpar: boolean; initial?: string }) {
  const [mode, setMode] = useState<Mode>("guide");
  const [turns, setTurns] = useState<Record<Mode, Turn[]>>({ guide: [], sparring: [] });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // 会話ごとの番号（記録で「同じ会話」をまとめるため）。消して最初からにすると新しくなる
  const [conv, setConv] = useState<Record<Mode, string>>(() => ({ guide: crypto.randomUUID(), sparring: crypto.randomUUID() }));
  const bottom = useRef<HTMLDivElement>(null);
  const list = turns[mode];

  // 新しいブラウザでは scrollIntoView が値を返すため、波かっこで包んで何も返さない（返すと画面が落ちる）
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [list]);
  // ホームから聞かれた質問は、開いたときに1回だけ送る
  const asked = useRef(false);
  useEffect(() => {
    if (!initial || asked.current) return;
    asked.current = true;
    window.history.replaceState(null, "", "/ai");
    void send(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Turn[] = [...list, { role: "user", content: q }];
    setTurns((t) => ({ ...t, [mode]: [...next, { role: "assistant", content: "" }] }));
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, messages: next.map((t) => (t.role === "assistant" ? { ...t, content: visible(t.content) } : t)), conversationId: conv[mode] }) });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "うまく送れませんでした");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setTurns((t) => ({ ...t, [mode]: [...next, { role: "assistant", content: acc }] }));
      }
    } catch (e) {
      setTurns((t) => ({ ...t, [mode]: [...next, { role: "assistant", content: `（${(e as Error).message}）` }] }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {canSpar && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-bold">
            {(
              [
                ["guide", "AI取説"],
                ["sparring", "壁打ち"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setMode(v)} className={`rounded-md px-4 py-1.5 ${mode === v ? "bg-white text-brand shadow-sm" : "text-slate-500"}`}>
                {l}
              </button>
            ))}
          </div>
          {mode === "sparring" && (
            <Link href="/admin/concepts" className="text-xs font-bold text-brand hover:underline">
              コンセプト帳を開く ›
            </Link>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500">
        {mode === "guide"
          ? "このシステムの使い方を、ふつうの言葉で聞いてください。AIは答えを間違えることがあります。お金や勤怠のことは、最後は画面で確かめてください。"
          : "コンセプト帳の柱と、売上・人件費の今の数字をふまえて考えます。柱とぶつかる案ははっきり指摘し、最後は次の一手を1つに絞ります。"}
      </p>

      <div className="min-h-[50vh] space-y-4 rounded-md border border-line bg-white p-4">
        {!list.length && (
          <div className="flex flex-wrap gap-2">
            {SUGGEST[mode].map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-brand hover:text-white">
                {s}
              </button>
            ))}
          </div>
        )}
        {list.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-brand px-4 py-2.5 text-sm text-white">
              {t.content}
            </div>
          ) : (
            <div key={i} className="max-w-[95%] rounded-lg bg-slate-50 px-4 py-3">
              {visible(t.content) ? <RichText text={visible(t.content)} /> : <span className="text-sm text-slate-400">考えています…</span>}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-20 flex gap-2 rounded-md border border-line bg-white p-2 shadow-sm lg:bottom-4"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(input);
          }}
          rows={2}
          maxLength={4000}
          placeholder={mode === "guide" ? "例：携帯を忘れて打刻できなかった" : "考えていることを、そのまま書いてください"}
          className="min-w-0 flex-1 resize-none rounded-md px-3 py-2 text-sm outline-none"
        />
        <button disabled={busy || !input.trim()} className="self-end rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "…" : "送る"}
        </button>
      </form>
      {list.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setTurns((t) => ({ ...t, [mode]: [] }));
            setConv((c) => ({ ...c, [mode]: crypto.randomUUID() }));
          }}
          className="self-start text-xs text-slate-400 hover:text-accent"
        >
          会話を消して最初から
        </button>
      )}
    </div>
  );
}
