"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { previewSegment, sendBroadcast, type Preview } from "./actions";

type Opt = { id: string; name: string };
const chip = "cursor-pointer";
const chipBox = "block rounded-full px-3 py-1 text-xs font-bold ring-1 ring-slate-200 peer-checked:bg-brand peer-checked:text-white peer-checked:ring-brand";

function Chips({ name, options }: { name: string; options: Opt[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <label key={o.id} className={chip}>
          <input type="checkbox" name={name} value={o.id} className="peer sr-only" />
          <span className={chipBox}>{o.name}</span>
        </label>
      ))}
    </div>
  );
}

/** 相手を選んで送る。条件を変えるたびに、何人に届くかを出す */
export function Compose({ companies, stores, roles, remaining }: { companies: Opt[]; stores: Opt[]; roles: Opt[]; remaining: number | null }) {
  const form = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [, startPreview] = useTransition();
  const [state, action, pending] = useActionState(sendBroadcast, undefined);
  const refresh = () => form.current && startPreview(async () => setPreview(await previewSegment(new FormData(form.current!))));
  const over = remaining !== null && preview !== null && preview.linked > remaining;

  return (
    <form
      ref={form}
      action={action}
      key={state?.ok ? state.at : "form"}
      onChange={refresh}
      onFocus={() => preview === null && refresh()}
      onSubmit={(e) => {
        if (!preview || !confirm(`${preview.linked}人にLINEを送ります（${preview.linked}通）。よろしいですか？`)) e.preventDefault();
      }}
      className="space-y-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-600">会社</p>
          <Chips name="companies" options={companies} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-600">店舗</p>
          <Chips name="stores" options={stores} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-600">雇用区分</p>
          <Chips name="roles" options={roles} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="managersOnly" className="size-4" />
          店長だけに送る
        </label>
        <p className="text-xs text-slate-400">何も選ばなければ在籍者全員です。種類どうしは「かつ」、同じ種類の中は「または」（例：根っこ × アルバイト）</p>
      </div>

      <textarea name="text" rows={6} maxLength={2000} required placeholder="本文（2000文字まで）" className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />

      <div className="rounded-md bg-slate-50 px-4 py-3 text-sm">
        {preview ? (
          <>
            <p>
              <b className="text-lg tabular-nums text-brand">{preview.linked}</b>人に届きます
              <span className="ml-2 text-xs text-slate-500">（対象 {preview.total}人）</span>
              {remaining !== null && <span className="ml-2 text-xs text-slate-500">今月の残り {remaining.toLocaleString()}通</span>}
            </p>
            {preview.unlinked.length > 0 && <p className="mt-1 text-xs text-amber-700">LINE未連携で届かない人：{preview.unlinked.join("、")}</p>}
            {over && <p className="mt-1 text-xs font-bold text-accent">今月の残り通数を超えます。送れない人が出ます</p>}
          </>
        ) : (
          <p className="text-xs text-slate-400">条件を選ぶと、届く人数が出ます</p>
        )}
      </div>

      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      {state?.ok && <p className="text-sm font-bold text-emerald-700">{state.ok}</p>}
      <button disabled={pending || !preview?.linked} className="rounded-lg bg-[#06C755] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "送っています…" : "LINEで送る"}
      </button>
    </form>
  );
}
