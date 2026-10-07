"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { finishUpload, startUpload } from "./actions";

const BUCKET = "private-files";
const ACCEPT = "image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf";

/**
 * 書類のアップロード。サーバーで準備 → ブラウザから保存場所へ直接送る → サーバーで完了確認、の3段階。
 * category を固定で渡すか、categories を渡して選ばせる
 */
export function FileUploader({
  ownerStaffId,
  category,
  categories,
  allowVisibilityToggle = false,
  label = "ファイルを選ぶ",
}: {
  ownerStaffId: string | null;
  category?: string;
  categories?: { value: string; label: string }[];
  allowVisibilityToggle?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState(category ?? categories?.[0]?.value ?? "other");
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const start = await startUpload({ category: cat, ownerStaffId, name: file.name, contentType: file.type, size: file.size, visibleToOwner: visible });
      if ("error" in start) throw new Error(start.error);
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
      if (error) throw new Error("送信に失敗しました。通信状況を確認して、もう一度お試しください");
      const done = await finishUpload(start.fileId);
      if ("error" in done) throw new Error(done.error);
      setMessage({ tone: "ok", text: `「${file.name}」をアップロードしました` });
      router.refresh();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {categories && (
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        {allowVisibilityToggle && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-4" />
            本人のマイページに表示
          </label>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-2 disabled:opacity-60"
        >
          {busy ? "アップロード中…" : label}
        </button>
        <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      <p className="text-xs text-slate-400">写真（JPEG・PNG・HEIC）またはPDF、10MBまで</p>
      {message && <p className={`text-sm font-bold ${message.tone === "ok" ? "text-emerald-700" : "text-accent"}`}>{message.text}</p>}
    </div>
  );
}
