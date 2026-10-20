"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishUpload, startUpload } from "@/app/files/actions";
import { addSlips } from "../actions";

/** 写真を縮めて JPEG に（PDF はそのまま） */
async function prepare(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
  if (file.type === "application/pdf") return { blob: file, type: "application/pdf", ext: "pdf" };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ng) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ng(new Error("画像を開けませんでした"));
      i.src = url;
    });
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error("変換できませんでした"))), "image/jpeg", 0.88));
    return { blob, type: "image/jpeg", ext: "jpg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 納品伝票の取り込み。スキャンした PDF・写真を何枚でも。店は選ぶか、AI にまかせる（伝票の宛名で判断） */
export function SlipUploader({ meId, stores }: { meId: string; stores: { id: string; name: string }[] }) {
  const router = useRouter();
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [store, setStore] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  const run = async (list: FileList | null, source: "upload" | "photo") => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setMsg(null);
    const ids: string[] = [];
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    try {
      for (const [n, f] of files.entries()) {
        setBusy(`送っています… ${n + 1}/${files.length}`);
        const p = await prepare(f);
        const st = await startUpload({ category: "receipt", ownerStaffId: meId, name: `納品伝票_${new Date().toISOString().slice(0, 10)}.${p.ext}`, contentType: p.type, size: p.blob.size, visibleToOwner: false });
        if ("error" in st) throw new Error(st.error);
        const { error } = await supabase.storage.from("private-files").uploadToSignedUrl(st.path, st.token, p.blob, { contentType: p.type });
        if (error) throw new Error("送れませんでした");
        const done = await finishUpload(st.fileId);
        if ("error" in done) throw new Error(done.error);
        ids.push(st.fileId);
      }
      setBusy("登録しています…");
      const r = await addSlips({ storeId: store || null, fileIds: ids, source });
      setMsg(r?.error ? { error: r.error } : { ok: r?.ok });
      router.refresh();
    } catch (e) {
      setMsg({ error: `${(e as Error).message}（${ids.length}枚目まで送れています）` });
      if (ids.length) await addSlips({ storeId: store || null, fileIds: ids, source });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">店</span>
        <select value={store} onChange={(e) => setStore(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5">
          <option value="">AI にまかせる（宛名で判断）</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={!!busy} onClick={() => pick.current?.click()} className="rounded-lg bg-brand py-4 font-bold text-white disabled:opacity-50">
          {busy ?? "スキャンした伝票を選ぶ（PDF・画像、何枚でも）"}
        </button>
        <button type="button" disabled={!!busy} onClick={() => camera.current?.click()} className="rounded-lg border border-brand py-4 font-bold text-brand disabled:opacity-50">
          📷 写真で撮る
        </button>
      </div>
      <input ref={pick} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => (run(e.target.files, "upload"), (e.target.value = ""))} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (run(e.target.files, "photo"), (e.target.value = ""))} />
      {msg?.ok && <p className="text-sm font-bold text-emerald-700">{msg.ok}</p>}
      {msg?.error && <p className="text-sm font-bold text-accent">{msg.error}</p>}
      <p className="text-xs text-slate-500">Googleドライブのフォルダからの自動取り込みは、ドライブの設定が済んだらつなぎます</p>
    </div>
  );
}
