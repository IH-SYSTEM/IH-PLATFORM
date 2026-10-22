"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishUpload, startUpload } from "@/app/files/actions";
import { addInvoices } from "./actions";

/** 請求書の取り込み：PDF・画像を何枚でも（写真は縮めて JPEG に） */
export function InvoiceUploader({ meId }: { meId: string }) {
  const router = useRouter();
  const pick = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  const toJpeg = async (file: File): Promise<Blob> => {
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
      return await new Promise<Blob>((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error("変換できませんでした"))), "image/jpeg", 0.88));
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const run = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setMsg(null);
    const ids: string[] = [];
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    try {
      for (const [n, f] of files.entries()) {
        setBusy(`送っています… ${n + 1}/${files.length}`);
        const pdf = f.type === "application/pdf";
        const blob = pdf ? f : await toJpeg(f);
        const type = pdf ? "application/pdf" : "image/jpeg";
        const st = await startUpload({ category: "receipt", ownerStaffId: meId, name: `請求書_${new Date().toISOString().slice(0, 10)}.${pdf ? "pdf" : "jpg"}`, contentType: type, size: blob.size, visibleToOwner: false });
        if ("error" in st) throw new Error(st.error);
        const { error } = await supabase.storage.from("private-files").uploadToSignedUrl(st.path, st.token, blob, { contentType: type });
        if (error) throw new Error("送れませんでした");
        const done = await finishUpload(st.fileId);
        if ("error" in done) throw new Error(done.error);
        ids.push(st.fileId);
      }
      setBusy("登録しています…");
      const r = await addInvoices(ids);
      setMsg(r?.error ? { error: r.error } : { ok: r?.ok });
    } catch (e) {
      setMsg({ error: `${(e as Error).message}（${ids.length}枚目まで送れています）` });
      if (ids.length) await addInvoices(ids);
    } finally {
      setBusy(null);
      router.refresh();
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-line bg-white p-5">
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={!!busy} onClick={() => pick.current?.click()} className="rounded-lg bg-brand py-4 font-bold text-white disabled:opacity-50">
          {busy ?? "請求書をアップする（PDF・画像、何枚でも）"}
        </button>
        <button type="button" disabled className="rounded-lg border border-slate-300 py-4 text-sm font-bold text-slate-400" title="スキャナの保存先が決まったら、つなぎます">
          スキャナのフォルダを確認（準備中）
        </button>
      </div>
      <input ref={pick} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => (run(e.target.files), (e.target.value = ""))} />
      {msg?.ok && <p className="text-sm font-bold text-emerald-700">{msg.ok}</p>}
      {msg?.error && <p className="text-sm font-bold text-accent">{msg.error}</p>}
      <p className="text-xs text-slate-500">
        店と勘定科目は AI が振り分けます。一度確かめた取引先は、次から自動で振り分けて承認します。分からないものは「どこの店の何の経費ですか？」とLINEで聞きます
      </p>
    </div>
  );
}
