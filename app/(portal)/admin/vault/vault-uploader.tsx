"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { deleteVaultFile, finishVaultUpload, fixVaultFile, resummarizeVaultFile, startVaultUpload } from "./actions";

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

/** 送る前の種類（端末によって CSV などが空で来るので、拡張子から補う） */
const typeOf = (f: File) => {
  if (f.type) return f.type;
  const ext = f.name.toLowerCase().split(".").pop();
  return ({ csv: "text/csv", pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as Record<string, string>)[ext ?? ""] ?? "";
};

/**
 * 会社の書類のアップロード。いくつでもまとめて選べる（ドラッグ＆ドロップも）。
 * 会社・種類は、ふだんは「AI に振り分けてもらう」。AI が中身を読んで、会社・種類・書類の名前・日付を決める
 */
export function VaultUploader({ companies, categories }: { companies: { id: string; name: string }[]; categories: { value: string; label: string }[] }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [company, setCompany] = useState("auto");
  const [cat, setCat] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const uploadOne = async (f: File) => {
    const type = typeOf(f);
    const start = await startVaultUpload({ companyId: company, category: cat, name: f.name, contentType: type, size: f.size, docDate: "", note: "" });
    if ("error" in start) throw new Error(start.error);
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(start.path, start.token, f, { contentType: type });
    if (error) throw new Error("送信に失敗しました");
    const done = await finishVaultUpload(start.fileId);
    if ("error" in done) throw new Error(done.error);
  };

  const uploadAll = async (list: File[]) => {
    if (!list.length) return;
    setBusy(true);
    setFailed([]);
    setMessage(null);
    const bad: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setProgress({ done: i, total: list.length });
      try {
        await uploadOne(list[i]);
      } catch (e) {
        bad.push(`${list[i].name}（${(e as Error).message}）`);
      }
    }
    setProgress(null);
    setFailed(bad);
    setMessage(`${list.length - bad.length}件を保管しました。AI が1件ずつ読んで振り分けています（1件1〜2分。再読み込みで反映されます）`);
    setBusy(false);
    if (file.current) file.current.value = "";
    router.refresh();
  };

  return (
    <div
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!busy) uploadAll([...e.dataTransfer.files]);
      }}
      className={`space-y-3 rounded-md border-2 border-dashed bg-white p-5 shadow-sm ${over ? "border-brand bg-brand-soft" : "border-slate-200"}`}
    >
      <h2 className="text-sm font-semibold text-slate-800">書類を保管する（まとめて入れられます）</h2>
      <p className="text-xs text-slate-500">今ある書類を、古いものも含めて全部入れてください。AI が中身を読んで、会社・種類・書類の名前・日付を振り分けます。同じ書類の版は「最新」「過去」に並びます</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">会社</span>
          <select value={company} onChange={(e) => setCompany(e.target.value)} className={`${input} w-full`}>
            <option value="auto">AI に振り分けてもらう</option>
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
            <option value="auto">AI に振り分けてもらう</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => file.current?.click()} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-2 disabled:opacity-60">
          {progress ? `保管しています… ${progress.done + 1}/${progress.total}` : "ファイルを選ぶ（いくつでも）"}
        </button>
        <span className="text-xs text-slate-400">ここにファイルを落としても入ります。PDF・写真・Excel・Word・CSV、1つ50MBまで</span>
        <input ref={file} type="file" accept={ACCEPT} multiple hidden onChange={(e) => uploadAll([...(e.target.files ?? [])])} />
      </div>
      {message && <p className="text-sm font-bold text-emerald-700">{message}</p>}
      {failed.length > 0 && (
        <div className="text-sm text-accent">
          <p className="font-bold">入らなかったもの（{failed.length}件）</p>
          <ul className="list-inside list-disc text-xs">
            {failed.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** AI の振り分けを直す */
export function FixForm({
  file,
  companies,
  categories,
}: {
  file: { id: string; company: string; category: string; doc_kind: string | null; doc_date: string | null; note: string | null };
  companies: { id: string; name: string }[];
  categories: { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(fixVaultFile.bind(null, file.id), undefined);
  return (
    <form action={formAction} className="mt-2 grid gap-2 rounded bg-slate-50 p-2 sm:grid-cols-3">
      <select name="company_id" defaultValue={file.company} className={input}>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select name="category" defaultValue={file.category} className={input}>
        {categories.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <input name="doc_kind" defaultValue={file.doc_kind ?? ""} maxLength={60} placeholder="書類の名前（例：定款）" className={input} />
      <input name="doc_date" type="date" defaultValue={file.doc_date ?? ""} className={input} />
      <input name="note" defaultValue={file.note ?? ""} maxLength={500} placeholder="メモ" className={input} />
      <button disabled={pending} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "保存中…" : "直す"}
      </button>
      {state?.error && <p className="text-xs text-accent sm:col-span-3">{state.error}</p>}
      {state?.ok && <p className="text-xs text-emerald-700 sm:col-span-3">{state.ok}</p>}
    </form>
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

export function ResummarizeButton({ fileId }: { fileId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await resummarizeVaultFile(fileId);
          if ("error" in r) window.alert(r.error);
          router.refresh();
        })
      }
      className="ml-1 font-bold text-brand underline disabled:opacity-50"
    >
      読み直す
    </button>
  );
}
