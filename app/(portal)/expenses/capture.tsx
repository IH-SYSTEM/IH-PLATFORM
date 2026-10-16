"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startUpload, finishUpload } from "@/app/files/actions";
import { sendReceipts } from "./actions";

type Shot = { key: string; url: string; fileId: string | null; error: string | null; memo: string };

/** 写真を縮めて JPEG にする（長い辺 2000px。iPhone の HEIC もここで JPEG になる＝AI が読める） */
async function toJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ng) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ng(new Error("写真を開けませんでした"));
      i.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error("写真を変換できませんでした"))), "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * レシートを続けて撮る。撮るたびに裏で送っておき、最後に「本部に送る」を押すだけ。
 * 金額・日付・勘定科目は入れなくてよい（AI が読み、本部が確かめる）
 */
export function ReceiptCapture({ meId, stores, defaultStore }: { meId: string; stores: { id: string; name: string }[]; defaultStore: string }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [store, setStore] = useState(defaultStore);
  const [payment, setPayment] = useState<"cash" | "transfer">("cash");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [sending, start] = useTransition();
  const patch = (key: string, p: Partial<Shot>) => setShots((s) => s.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const upload = async (file: File) => {
    const key = crypto.randomUUID();
    const preview = URL.createObjectURL(file);
    setShots((s) => [...s, { key, url: preview, fileId: null, error: null, memo: "" }]);
    try {
      // PDF（請求書など）はそのまま、写真は JPEG に
      const pdf = file.type === "application/pdf";
      const jpeg: Blob = pdf ? file : await toJpeg(file);
      const type = pdf ? "application/pdf" : "image/jpeg";
      const st = await startUpload({ category: "receipt", ownerStaffId: meId, name: `レシート_${new Date().toISOString().slice(0, 10)}.${pdf ? "pdf" : "jpg"}`, contentType: type, size: jpeg.size });
      if ("error" in st) throw new Error(st.error);
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { error } = await supabase.storage.from("private-files").uploadToSignedUrl(st.path, st.token, jpeg, { contentType: type });
      if (error) throw new Error("送れませんでした");
      const done = await finishUpload(st.fileId);
      if ("error" in done) throw new Error(done.error);
      patch(key, { fileId: st.fileId });
    } catch (e) {
      patch(key, { error: (e as Error).message });
    }
  };
  const onFiles = (list: FileList | null) => {
    setMsg(null);
    for (const f of Array.from(list ?? [])) void upload(f);
  };
  const uploading = shots.some((s) => !s.fileId && !s.error);
  const ready = shots.filter((s) => s.fileId);

  const send = () =>
    start(async () => {
      const r = await sendReceipts({ storeId: store, payment, items: ready.map((s) => ({ fileId: s.fileId!, memo: s.memo })) });
      if (r?.error) return setMsg({ error: r.error });
      shots.forEach((s) => URL.revokeObjectURL(s.url));
      setShots([]);
      setMsg({ ok: r?.ok });
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs font-bold text-slate-600">
          店
          <select value={store} onChange={(e) => setStore(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1 text-xs font-bold text-slate-600">
          支払い方法
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-300 text-sm">
            {(
              [
                ["cash", "店の現金"],
                ["transfer", "振込（請求書）"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setPayment(v)} className={`py-2.5 font-bold ${payment === v ? "bg-brand text-white" : "bg-white text-slate-600"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button type="button" onClick={() => camera.current?.click()} className="flex w-full flex-col items-center gap-1 rounded-xl bg-brand py-6 text-white active:scale-[0.99]">
        <span className="text-3xl">📷</span>
        <span className="text-lg font-bold">{shots.length ? "次のレシートを撮る" : "レシートを撮る"}</span>
        <span className="text-xs text-white/75">1枚撮るごとに、続けて押してください</span>
      </button>
      <button type="button" onClick={() => album.current?.click()} className="w-full text-center text-sm text-slate-500 underline">
        写真アプリから選ぶ（何枚でも）
      </button>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
      <input ref={album} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />

      {shots.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shots.map((s, i) => (
            <li key={s.key} className="overflow-hidden rounded-lg border border-line bg-white">
              <div className="relative aspect-[3/4] bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} onError={(e) => (e.currentTarget.style.visibility = "hidden")} alt={`レシート${i + 1}`} className="size-full object-cover" />
                <span className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.error ? "bg-accent text-white" : s.fileId ? "bg-emerald-600 text-white" : "bg-white/90 text-slate-600"}`}>
                  {s.error ? "失敗" : s.fileId ? `✓ ${i + 1}` : "送信中…"}
                </span>
                <button
                  type="button"
                  onClick={() => setShots((x) => x.filter((y) => y.key !== s.key))}
                  className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/50 text-sm text-white"
                  aria-label="この写真を外す"
                >
                  ×
                </button>
              </div>
              {s.error ? (
                <p className="p-2 text-xs text-accent">{s.error}（×で外して撮り直してください）</p>
              ) : (
                <input value={s.memo} onChange={(e) => patch(s.key, { memo: e.target.value })} maxLength={200} placeholder="メモ（任意）例：まかない用" className="w-full border-t border-line px-2 py-1.5 text-xs" />
              )}
            </li>
          ))}
        </ul>
      )}

      {msg?.error && <p className="text-sm font-bold text-accent">{msg.error}</p>}
      {msg?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{msg.ok}。AI が読んで本部が確かめます</p>}
      {shots.length > 0 && (
        <button type="button" disabled={sending || uploading || !ready.length} onClick={send} className="w-full rounded-lg bg-slate-900 py-4 text-lg font-bold text-white disabled:opacity-40">
          {sending ? "送っています…" : uploading ? "写真を送っています…" : `本部に送る（${ready.length}枚）`}
        </button>
      )}
    </div>
  );
}
