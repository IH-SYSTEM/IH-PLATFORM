"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rejectSlip, rereadSlip, saveSlip, type SlipInput } from "../../actions";

type Line = SlipInput["lines"][number];
const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const num = (v: unknown) => Number(String(v ?? "").replace(/[,，\s円¥]/g, "")) || 0;

/**
 * 納品伝票の確認。品目の列は「この店の品目」から選ぶか、「新しい品目にする」「数えない（送料など）」。
 * Ctrl（⌘）＋Enter で「保存して次へ」
 */
export function SlipEditor({
  id,
  status,
  initial,
  stores,
  items,
  queue,
}: {
  id: string;
  status: string;
  initial: SlipInput;
  stores: { id: string; name: string }[];
  items: { id: string; name: string; store_id: string }[];
  queue: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<SlipInput>(initial);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, start] = useTransition();
  const mine = items.filter((i) => i.store_id === v.store_id);
  const total = v.lines.reduce((a, l) => a + num(l.amount), 0);
  const setLine = (i: number, p: Partial<Line>) => setV((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const data = (): SlipInput => ({ ...v, lines: v.lines.map((l) => ({ ...l, qty: num(l.qty) || 1, amount: num(l.amount), unit_price: l.unit_price === null || String(l.unit_price) === "" ? null : num(l.unit_price) })) });
  const go = (next: string | null | undefined) => router.push(next ? `/inventory/slips/${next}?q=1` : "/inventory/slips");
  const save = (approve: boolean) =>
    start(async () => {
      const r = await saveSlip(id, data(), approve);
      if (r?.error) return setMsg({ error: r.error });
      setMsg({ ok: r?.ok });
      if (approve && queue) go(r?.nextId);
      else router.refresh();
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && status !== "approved") {
        e.preventDefault();
        save(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5 text-xs text-slate-500">
          店
          <select value={v.store_id} onChange={(e) => setV({ ...v, store_id: e.target.value })} className={`${input} ${v.store_id ? "" : "border-amber-400 bg-amber-50"}`}>
            <option value="">選んでください</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-0.5 text-xs text-slate-500">
          納品日
          <input type="date" value={v.slip_date} onChange={(e) => setV({ ...v, slip_date: e.target.value })} className={input} />
        </label>
        <label className="col-span-2 space-y-0.5 text-xs text-slate-500">
          取引先
          <input value={v.vendor} onChange={(e) => setV({ ...v, vendor: e.target.value })} className={input} />
        </label>
        <label className="space-y-0.5 text-xs text-slate-500">
          8%の消費税
          <input value={v.tax8} onChange={(e) => setV({ ...v, tax8: e.target.value })} inputMode="numeric" className={`${input} text-right`} />
        </label>
        <label className="space-y-0.5 text-xs text-slate-500">
          10%の消費税
          <input value={v.tax10} onChange={(e) => setV({ ...v, tax10: e.target.value })} inputMode="numeric" className={`${input} text-right`} />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500">納品の中身（税込）</p>
        {v.lines.map((l, i) => (
          <div key={i} className="space-y-1.5 rounded-md border border-slate-200 p-2">
            <div className="flex gap-1.5">
              <input value={l.raw_name} onChange={(e) => setLine(i, { raw_name: e.target.value })} placeholder="品名" className={`${input} flex-1`} />
              <button type="button" onClick={() => setV((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))} className="px-2 text-slate-400 hover:text-accent" aria-label="この行を消す">
                ×
              </button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_4rem_3.5rem_5.5rem_6rem_4.5rem] gap-1.5">
              <select value={l.item} onChange={(e) => setLine(i, { item: e.target.value })} className={`${input} ${l.item ? "" : "text-slate-400"}`}>
                <option value="">数えない（送料など）</option>
                <option value="new">＋ 新しい品目にする</option>
                {mine.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </select>
              <input value={String(l.qty)} onChange={(e) => setLine(i, { qty: e.target.value as unknown as number })} inputMode="decimal" placeholder="数量" className={`${input} text-right`} />
              <input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} placeholder="単位" className={input} />
              <input value={l.unit_price === null ? "" : String(l.unit_price)} onChange={(e) => setLine(i, { unit_price: e.target.value as unknown as number })} inputMode="decimal" placeholder="単価" className={`${input} text-right`} />
              <input value={String(l.amount)} onChange={(e) => setLine(i, { amount: e.target.value as unknown as number })} inputMode="numeric" placeholder="金額" className={`${input} text-right`} />
              <select value={l.tax_rate} onChange={(e) => setLine(i, { tax_rate: Number(e.target.value) })} className={input}>
                <option value={8}>8%</option>
                <option value={10}>10%</option>
                <option value={0}>対象外</option>
              </select>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setV((x) => ({ ...x, lines: [...x.lines, { raw_name: "", item: "", qty: 1, unit: "", unit_price: null, amount: 0, tax_rate: 8 }] }))} className="text-xs font-bold text-brand">
          ＋ 行を足す
        </button>
      </div>

      <p className="flex justify-between rounded-md bg-slate-50 p-3 text-sm font-bold">
        <span>合計（税込）</span>
        <span className="tabular-nums">{total.toLocaleString()}円</span>
      </p>
      {msg?.error && <p className="text-sm font-bold text-accent">{msg.error}</p>}
      {msg?.ok && <p className="text-sm font-bold text-emerald-700">{msg.ok}</p>}
      {status !== "approved" && (
        <button type="button" disabled={busy} onClick={() => save(true)} className="w-full rounded-lg bg-brand py-3.5 font-bold text-white disabled:opacity-50">
          {busy ? "…" : queue ? "保存して次へ" : "保存する"}
          <span className="ml-2 text-xs font-normal text-white/70">Ctrl/⌘＋Enter</span>
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => save(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-300">
          {status === "approved" ? "直して保存" : "途中で保存"}
        </button>
        {status !== "approved" && (
          <>
            <button type="button" disabled={busy} onClick={() => start(async () => setMsg((await rereadSlip(id)) ?? null))} className="rounded-lg px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-300">
              AI に読み直させる
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("この伝票を取り消しますか？（二重の取り込み・関係ない画像など。仕入れに入りません）")) return;
                start(async () => {
                  const r = await rejectSlip(id);
                  if (queue) go(r?.nextId);
                  else router.refresh();
                });
              }}
              className="rounded-lg px-4 py-2 text-sm font-bold text-accent ring-1 ring-accent/40"
            >
              取り消す
            </button>
          </>
        )}
      </div>
    </div>
  );
}
