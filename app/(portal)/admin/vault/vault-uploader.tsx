"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { deleteVaultFile, finishVaultUpload, startVaultUpload } from "./actions";

const BUCKET = "private-files";
const ACCEPT = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  ".csv",
].join(",");
const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

/** 会社の書類のアップロード（会社・種類・日付・メモを決めてからファイルを選ぶ） */
export function VaultUploader({ companies, categories, companyId }: { companies: { id: string; name: string }[]; categories: { value: string; label: string }[]; companyId: string }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [company, setCompany] = useState(companyId);
  const [cat, setCat] = useState(categories[0]?.value ?? "corp_other");
  const [docDate, setDocDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const upload = async (f: File) => {
    setBusy(true);
    setMessage(null);
    try {
      // CSV は端末によって種類が空で来るので補う
      const type = f.type || (f.name.toLowerCase().endsWith(".csv") ? "text/csv" : "");
      const start = await startVaultUpload({ companyId: company, category: cat, name: f.name, contentType: type, size: f.size, docDate, note });
      if ("error" in start) throw new Error(start.error);
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(start.path, start.token, f, { contentType: type });
      if (error) throw new Error("送信に失敗しました。通信状況を確かめて、もう一度お試しください");
      const done = await finishVaultUpload(start.fileId);
      if ("error" in done) throw new Error(done.error);
      setMessage({ tone: "ok", text: `「${f.name}」を保管しました` });
      setNote("");
      router.refresh();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">書類を保管する</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">会社</span>
          <select value={company} onChange={(e) => setCompany(e.target.value)} className={`${input} w-full`}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">書類の種類</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${input} w-full`}>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">書類の日付（任意。決算期末・登記日・契約日など）</span>
          <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={`${input} w-full`} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">メモ（任意）</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="例：第12期（2026年3月期）" className={`${input} w-full`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => file.current?.click()} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-2 disabled:opacity-60">
          {busy ? "アップロード中…" : "ファイルを選んで保管する"}
        </button>
        <span className="text-xs text-slate-400">PDF・写真・Excel・Word・CSV、50MBまで</span>
        <input ref={file} type="file" accept={ACCEPT} hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {message && <p className={`text-sm font-bold ${message.tone === "ok" ? "text-emerald-700" : "text-accent"}`}>{message.text}</p>}
    </div>
  );
}

export function VaultDeleteButton({ fileId, name }: { fileId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`「${name}」を消しますか？（元に戻せません。消した記録は残ります）`)) return;
        start(async () => {
          const r = await deleteVaultFile(fileId);
          if ("error" in r) window.alert(r.error);
          router.refresh();
        });
      }}
      className="text-xs text-slate-400 hover:text-accent disabled:opacity-50"
    >
      消す
    </button>
  );
}
