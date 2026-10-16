"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rejectExpense, rereadExpense, saveExpense, type ExpenseInput } from "../actions";

type Line = { account_title: string; tax_rate: number; amount: string; item: string };
export type EditorExpense = {
  id: string;
  status: string;
  expense_date: string | null;
  vendor: string | null;
  invoice_number: string | null;
  payment_method: "cash" | "transfer";
  store_id: string | null;
  exported: boolean;
  lines: { account_title: string | null; tax_rate: number; amount: number; item: string | null }[];
};

const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
const num = (s: string) => Number(String(s).replace(/[,，\s円¥]/g, "")) || 0;

/** レシートの写真（押すと拡大。回せる） */
export function ReceiptView({ src, pdf }: { src: string; pdf: boolean }) {
  const [zoom, setZoom] = useState(false);
  const [rot, setRot] = useState(0);
  if (pdf) return <object data={src} type="application/pdf" className="h-[75vh] w-full rounded-md border border-line" aria-label="レシート" />;
  return (
    <div className="space-y-2">
      <div className={`overflow-auto rounded-md border border-line bg-slate-900/5 ${zoom ? "h-[75vh]" : "max-h-[75vh]"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="レシート"
          onClick={() => setZoom((z) => !z)}
          style={{ transform: `rotate(${rot}deg)`, transformOrigin: "center" }}
          className={`mx-auto transition ${zoom ? "max-w-none w-[200%] cursor-zoom-out" : "max-h-[75vh] w-auto cursor-zoom-in"}`}
        />
      </div>
      <div className="flex justify-center gap-2 text-xs">
        <button type="button" onClick={() => setZoom((z) => !z)} className="rounded-full px-3 py-1 ring-1 ring-slate-300">
          {zoom ? "縮める" : "拡大"}
        </button>
        <button type="button" onClick={() => setRot((r) => (r + 90) % 360)} className="rounded-full px-3 py-1 ring-1 ring-slate-300">
          回す ↻
        </button>
        <a href={src} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1 ring-1 ring-slate-300">
          別の画面で開く
        </a>
      </div>
    </div>
  );
}

/**
 * 経費1件の確認と修正。内訳（勘定科目×税率）ごとに金額を入れ、合計と税率ごとの消費税をその場で出す。
 * Ctrl（⌘）＋Enter で「承認して次へ」
 */
export function ExpenseEditor({ e, titles, stores, queue }: { e: EditorExpense; titles: string[]; stores: { id: string; name: string }[]; queue: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(e.expense_date ?? "");
  const [vendor, setVendor] = useState(e.vendor ?? "");
  const [invoice, setInvoice] = useState(e.invoice_number ?? "");
  const [payment, setPayment] = useState(e.payment_method);
  const [store, setStore] = useState(e.store_id ?? stores[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>(
    e.lines.length ? e.lines.map((l) => ({ account_title: l.account_title ?? "", tax_rate: l.tax_rate, amount: String(l.amount), item: l.item ?? "" })) : [{ account_title: "", tax_rate: 10, amount: "", item: "" }],
  );
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, start] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);
  const locked = e.exported;

  const total = lines.reduce((a, l) => a + num(l.amount), 0);
  const byRate = [10, 8, 0].map((r) => {
    const base = lines.filter((l) => l.tax_rate === r).reduce((a, l) => a + num(l.amount), 0);
    return { rate: r, base, tax: r ? Math.floor((base * r) / (100 + r)) : 0 };
  });
  const setLine = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const data = (): ExpenseInput => ({
    expense_date: date,
    vendor,
    invoice_number: invoice,
    payment_method: payment,
    store_id: store,
    lines: lines.map((l) => ({ account_title: l.account_title, tax_rate: l.tax_rate, amount: num(l.amount), item: l.item })),
  });
  const go = (nextId: string | null | undefined) => {
    if (nextId) router.push(`/admin/expenses/${nextId}?q=1`);
    else router.push(queue ? "/admin/expenses/review" : "/admin/expenses");
  };

  const save = (approve: boolean) =>
    start(async () => {
      const r = await saveExpense(e.id, data(), approve);
      if (r.error) return setMsg({ error: r.error });
      setMsg({ ok: r.ok });
      if (approve) go(r.nextId);
      else router.refresh();
    });
  const reject = () =>
    start(async () => {
      const r = await rejectExpense(e.id, reason);
      if (r.error) return setMsg({ error: r.error });
      go(r.nextId);
    });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter" && !locked && e.status !== "approved") {
        ev.preventDefault();
        save(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div ref={formRef} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5 text-xs text-slate-500">
          日付
          <input type="date" value={date} onChange={(x) => setDate(x.target.value)} disabled={locked} className={input} />
        </label>
        <label className="space-y-0.5 text-xs text-slate-500">
          店
          <select value={store} onChange={(x) => setStore(x.target.value)} disabled={locked} className={input}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-0.5 text-xs text-slate-500">
          お店・取引先
          <input value={vendor} onChange={(x) => setVendor(x.target.value)} disabled={locked} maxLength={100} className={input} />
        </label>
        <label className="space-y-0.5 text-xs text-slate-500">
          登録番号（インボイス）
          <input value={invoice} onChange={(x) => setInvoice(x.target.value)} disabled={locked} placeholder="T＋13桁（なければ空）" className={`${input} tabular-nums`} />
        </label>
        <div className="col-span-2 space-y-0.5 text-xs text-slate-500">
          支払い方法
          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-300 text-sm">
            {(
              [
                ["cash", "店の現金（現金／売上金）"],
                ["transfer", "振込（未払金）"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" disabled={locked} onClick={() => setPayment(v)} className={`py-1.5 font-bold ${payment === v ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500">内訳（勘定科目×税率ごと・税込）</p>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_1.75rem] items-center gap-1.5">
            <select value={l.account_title} onChange={(x) => setLine(i, { account_title: x.target.value })} disabled={locked} className={`${input} ${l.account_title ? "" : "border-amber-400 bg-amber-50"}`}>
              <option value="">勘定科目</option>
              {titles.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select value={l.tax_rate} onChange={(x) => setLine(i, { tax_rate: Number(x.target.value) })} disabled={locked} className={input}>
              <option value={10}>10%</option>
              <option value={8}>8%軽減</option>
              <option value={0}>対象外</option>
            </select>
            <input value={l.amount} onChange={(x) => setLine(i, { amount: x.target.value })} disabled={locked} inputMode="numeric" placeholder="金額" className={`${input} text-right tabular-nums`} />
            <button type="button" disabled={locked || lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-slate-400 hover:text-accent disabled:opacity-30" aria-label="この行を消す">
              ×
            </button>
            <input value={l.item} onChange={(x) => setLine(i, { item: x.target.value })} disabled={locked} placeholder="何を買ったか（摘要に入ります）" className={`${input} col-span-3 text-xs`} />
          </div>
        ))}
        {!locked && (
          <button type="button" onClick={() => setLines((ls) => [...ls, { account_title: "", tax_rate: 10, amount: "", item: "" }])} className="text-xs font-bold text-brand">
            ＋ 行を足す（税率・勘定科目が違うものが混ざっているとき）
          </button>
        )}
      </div>

      <div className="rounded-md bg-slate-50 p-3 text-sm">
        <p className="flex justify-between font-bold">
          <span>合計（税込）</span>
          <span className="tabular-nums">{yen(total)}</span>
        </p>
        {byRate
          .filter((r) => r.base)
          .map((r) => (
            <p key={r.rate} className="flex justify-between text-xs text-slate-500">
              <span>{r.rate ? `${r.rate}%対象 ${yen(r.base)}` : `対象外 ${yen(r.base)}`}</span>
              <span className="tabular-nums">{r.rate ? `うち消費税 ${yen(r.tax)}` : ""}</span>
            </p>
          ))}
      </div>

      {msg?.error && <p className="text-sm font-bold text-accent">{msg.error}</p>}
      {msg?.ok && <p className="text-sm font-bold text-emerald-700">{msg.ok}</p>}

      {locked ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-center text-sm font-bold text-emerald-700">マネーフォワードに書き出し済み（直せません）</p>
      ) : (
        <div className="space-y-2">
          {e.status !== "approved" && (
            <button type="button" disabled={busy} onClick={() => save(true)} className="w-full rounded-lg bg-brand py-3.5 text-base font-bold text-white disabled:opacity-50">
              {busy ? "…" : queue ? "承認して次へ" : "承認する"}
              <span className="ml-2 text-xs font-normal text-white/70">Ctrl/⌘＋Enter</span>
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => save(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-300 disabled:opacity-50">
              {e.status === "approved" ? "直して保存" : "保存だけ"}
            </button>
            {e.status !== "approved" && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      const r = await rereadExpense(e.id);
                      setMsg(r.error ? { error: r.error } : { ok: r.ok });
                    })
                  }
                  className="rounded-lg px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-300 disabled:opacity-50"
                >
                  AI に読み直させる
                </button>
                <button type="button" onClick={() => setRejecting((v) => !v)} className="rounded-lg px-4 py-2 text-sm font-bold text-accent ring-1 ring-accent/40">
                  差し戻す
                </button>
              </>
            )}
          </div>
          {rejecting && (
            <div className="space-y-2 rounded-md border border-accent/30 p-3">
              <div className="flex flex-wrap gap-1.5">
                {["写真がぼやけて読めません", "レシートの一部が切れています", "同じレシートが2回届いています", "会社の経費ではないようです"].map((t) => (
                  <button key={t} type="button" onClick={() => setReason(t)} className="rounded-full px-2.5 py-1 text-xs ring-1 ring-slate-300">
                    {t}
                  </button>
                ))}
              </div>
              <input value={reason} onChange={(x) => setReason(x.target.value)} maxLength={200} placeholder="差し戻す理由（送った人に LINE で届きます）" className={input} />
              <button type="button" disabled={busy || !reason.trim()} onClick={reject} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                差し戻して次へ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
