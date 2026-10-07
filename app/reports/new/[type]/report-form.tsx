"use client";

import { useActionState, useEffect, useState } from "react";
import type { Field } from "@/lib/reports/fields";
import type { SubmitState } from "../../actions";

type Option = { value: string; label: string };

const input = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-brand";

export function ReportForm({
  fields,
  stores,
  defaultStore,
  staff,
  defaults,
  onSiteOnly,
  action,
}: {
  fields: readonly Field[];
  stores: Option[];
  defaultStore: string;
  staff: Option[];
  defaults: Record<string, string>;
  onSiteOnly: boolean;
  action: (prev: SubmitState, fd: FormData) => Promise<SubmitState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // 店舗の近くにいることを確かめるため、送信の前に位置を取っておく
  useEffect(() => {
    if (!navigator.geolocation) {
      const t = setTimeout(() => setGeoError("この端末では位置情報を使えません"), 0);
      return () => clearTimeout(t);
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeoError(null);
      },
      (e) => setGeoError(e.code === e.PERMISSION_DENIED ? "位置情報の利用を許可してください（店舗の近くにいることの確認に使います）" : "位置情報を取得できませんでした"),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return (
    <form action={formAction} className="space-y-4 rounded-md border border-line bg-white p-5">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">店舗</span>
        <select name="store" defaultValue={defaultStore} required className={input}>
          <option value="" disabled>
            選んでください
          </option>
          {stores.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {fields.map((f) => (
        <label key={f.key} className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">
            {f.label}
            {f.kind === "text" && f.optional && <span className="ml-1 text-xs text-slate-400">（任意）</span>}
          </span>
          {f.kind === "staff" ? (
            <select name={f.key} defaultValue="" required className={input}>
              <option value="" disabled>
                選んでください
              </option>
              {staff.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.kind === "date" ? (
            <input type="date" name={f.key} defaultValue={defaults.date} required className={input} />
          ) : f.kind === "time" ? (
            <input type="time" name={f.key} defaultValue={defaults.time} required className={input} />
          ) : f.kind === "select" ? (
            <select name={f.key} defaultValue={f.options[0]} className={input}>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.kind === "minutes" ? (
            <select name={f.key} defaultValue={String(f.options[0])} className={input}>
              {f.options.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "なし" : `${m}分`}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" name={f.key} maxLength={f.max} placeholder={`${f.max}文字まで`} className={input} />
          )}
          {f.hint && <span className="block text-xs text-slate-400">{f.hint}</span>}
        </label>
      ))}

      <input type="hidden" name="lat" value={pos?.lat ?? ""} />
      <input type="hidden" name="lng" value={pos?.lng ?? ""} />
      {onSiteOnly && (
        <p className={`text-xs ${geoError ? "font-bold text-accent" : "text-slate-400"}`}>
          {geoError ?? (pos ? "位置情報を確認しました（店舗の近くからだけ送れます）" : "位置情報を確認しています…")}
        </p>
      )}

      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      <button
        type="submit"
        disabled={pending || (onSiteOnly && !pos)}
        className="block w-full rounded-lg bg-brand py-4 text-lg font-bold text-white hover:bg-brand-2 disabled:opacity-50"
      >
        {pending ? "送信しています…" : "本部に報告する"}
      </button>
    </form>
  );
}
