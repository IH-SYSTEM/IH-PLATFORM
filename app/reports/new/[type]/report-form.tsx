"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Field } from "@/lib/reports/fields";
import { finishUpload, startUpload } from "@/app/files/actions";
import type { SubmitState } from "../../actions";

type Option = { value: string; label: string };

const input = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-brand";

export function ReportForm({
  meId,
  fields,
  stores,
  defaultStore,
  staff,
  defaults,
  onSiteOnly,
  action,
}: {
  meId: string;
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
  const [uploading, setUploading] = useState(false);

  // 店舗の近くにいることを確かめる報告だけ、送信の前に位置を取っておく
  useEffect(() => {
    if (!onSiteOnly) return;
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
  }, [onSiteOnly]);

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
        <div key={f.key} className="block space-y-1">
          <label htmlFor={`f-${f.key}`} className="text-sm font-medium text-slate-700">
            {f.label}
            {(((f.kind === "text" || f.kind === "longtext" || f.kind === "time") && f.optional) || f.kind === "photo") && (
              <span className="ml-1 text-xs text-slate-400">（任意）</span>
            )}
          </label>
          {f.kind === "staff" ? (
            <select id={`f-${f.key}`} name={f.key} defaultValue="" required className={input}>
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
            <input id={`f-${f.key}`} type="date" name={f.key} defaultValue={defaults.date} required className={input} />
          ) : f.kind === "time" ? (
            <input id={`f-${f.key}`} type="time" name={f.key} defaultValue={f.optional ? "" : defaults.time} required={!f.optional} className={input} />
          ) : f.kind === "select" ? (
            <select id={`f-${f.key}`} name={f.key} defaultValue={f.options[0]} className={input}>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.kind === "minutes" ? (
            <select id={`f-${f.key}`} name={f.key} defaultValue={String(f.options[0])} className={input}>
              {f.options.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "なし" : `${m}分`}
                </option>
              ))}
            </select>
          ) : f.kind === "amount" ? (
            <input id={`f-${f.key}`} name={f.key} inputMode="numeric" required placeholder="例：-1000" className={`${input} tabular-nums`} />
          ) : f.kind === "longtext" ? (
            <textarea id={`f-${f.key}`} name={f.key} maxLength={f.max} rows={5} required={!f.optional} placeholder={`${f.max}文字まで`} className={input} />
          ) : f.kind === "photo" ? (
            <PhotoField name={f.key} ownerId={meId} onBusy={setUploading} />
          ) : (
            <input id={`f-${f.key}`} type="text" name={f.key} maxLength={f.max} required={!f.optional} placeholder={`${f.max}文字まで`} className={input} />
          )}
          {f.hint && <span className="block text-xs text-slate-400">{f.hint}</span>}
        </div>
      ))}

      {onSiteOnly && (
        <>
          <input type="hidden" name="lat" value={pos?.lat ?? ""} />
          <input type="hidden" name="lng" value={pos?.lng ?? ""} />
          <p className={`text-xs ${geoError ? "font-bold text-accent" : "text-slate-400"}`}>
            {geoError ?? (pos ? "位置情報を確認しました（店舗の近くからだけ送れます）" : "位置情報を確認しています…")}
          </p>
        </>
      )}

      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      <button
        type="submit"
        disabled={pending || uploading || (onSiteOnly && !pos)}
        className="block w-full rounded-lg bg-brand py-4 text-lg font-bold text-white hover:bg-brand-2 disabled:opacity-50"
      >
        {pending ? "送信しています…" : uploading ? "写真を送っています…" : "本部に報告する"}
      </button>
    </form>
  );
}

/** 写真：選んだらすぐ非公開の保存場所へ送り、ファイルの番号だけをフォームに入れる */
function PhotoField({ name, ownerId, onBusy }: { name: string; ownerId: string; onBusy: (b: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileId, setFileId] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    onBusy(true);
    setError(null);
    try {
      const start = await startUpload({ category: "report", ownerStaffId: ownerId, name: file.name, contentType: file.type, size: file.size });
      if ("error" in start) throw new Error(start.error);
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { error: e } = await supabase.storage.from("private-files").uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
      if (e) throw new Error("送信に失敗しました。もう一度選んでください");
      const done = await finishUpload(start.fileId);
      if ("error" in done) throw new Error(done.error);
      setFileId(start.fileId);
      setLabel(file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      onBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={name} value={fileId} />
      <button type="button" onClick={() => ref.current?.click()} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-brand">
        {fileId ? "写真を選び直す" : "写真を選ぶ"}
      </button>
      {label && <span className="text-sm text-emerald-700">✓ {label}</span>}
      {error && <span className="text-sm font-bold text-accent">{error}</span>}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </div>
  );
}
