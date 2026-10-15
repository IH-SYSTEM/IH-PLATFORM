"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { finishBankUpload, startBankUpload } from "./actions";

const BUCKET = "private-files";
const typeOf = (f: File) => f.type || (f.name.toLowerCase().endsWith(".csv") ? "text/csv" : "");

/** 銀行から書類を送る（いくつでも） */
export function BankUploader() {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const send = async (list: File[]) => {
    if (!list.length) return;
    setBusy(true);
    setMessage(null);
    const bad: string[] = [];
    for (const f of list) {
      try {
        const type = typeOf(f);
        const start = await startBankUpload({ name: f.name, contentType: type, size: f.size, note });
        if ("error" in start) throw new Error(start.error);
        const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(start.path, start.token, f, { contentType: type });
        if (error) throw new Error("送信に失敗しました");
        const done = await finishBankUpload(start.fileId);
        if ("error" in done) throw new Error(done.error);
      } catch (e) {
        bad.push(`${f.name}（${(e as Error).message}）`);
      }
    }
    setBusy(false);
    setNote("");
    if (file.current) file.current.value = "";
    setMessage(bad.length ? { tone: "error", text: `送れなかったもの：${bad.join("、")}` } : { tone: "ok", text: `${list.length}件をお預かりしました。ありがとうございます` });
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="ひとこと（任意）" className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button type="button" disabled={busy} onClick={() => file.current?.click()} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
        {busy ? "送っています…" : "ファイルを選んで送る"}
      </button>
      <span className="ml-2 text-xs text-slate-400">PDF・写真・Excel・Word・CSV、1つ50MBまで</span>
      <input ref={file} type="file" multiple hidden onChange={(e) => send([...(e.target.files ?? [])])} />
      {message && <p className={`text-sm font-bold ${message.tone === "ok" ? "text-emerald-700" : "text-accent"}`}>{message.text}</p>}
    </div>
  );
}
