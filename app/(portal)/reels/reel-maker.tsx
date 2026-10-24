"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reelStatus, runReel, startReel } from "./actions";

const SECONDS = [15, 30, 45, 60, 90];
type Result = { url: string | null; downloadUrl: string | null; fileName: string };

/** リールを作る：動画を選ぶ → 秒数・BGM を決める → スタート → できたら見て保存 */
export function ReelMaker({ bgm }: { bgm: { id: string; name: string; mood: string }[] }) {
  const router = useRouter();
  const pick = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [seconds, setSeconds] = useState(30);
  const [bgmMode, setBgmMode] = useState<"auto" | "pick" | "none">(bgm.length ? "auto" : "none");
  const [bgmId, setBgmId] = useState(bgm[0]?.id ?? "");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [shareFile, setShareFile] = useState<File | null>(null);

  // できた動画を先に読んでおく（iPhone の「ビデオを保存」は、押してすぐ共有を開かないと止められるため）
  useEffect(() => {
    if (!result?.url) return;
    let alive = true;
    fetch(result.url)
      .then((r) => r.blob())
      .then((b) => alive && setShareFile(new File([b], result.fileName, { type: "video/mp4" })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [result]);

  const start = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setShareFile(null);
    try {
      setBusy("動画を送っています");
      setProgress(0);
      const st = await startReel({ seconds, bgmMode, bgmId: bgmMode === "pick" ? bgmId : null, memo, name: file.name, size: file.size });
      if ("error" in st) throw new Error(st.error);
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      for (const [i, u] of st.uploads.entries()) {
        const part = file.slice(i * st.chunk, (i + 1) * st.chunk);
        const { error: e } = await supabase.storage.from("reels").uploadToSignedUrl(u.path, u.token, part, { contentType: "application/octet-stream" });
        if (e) throw new Error("動画を送れませんでした。電波のよい所で、もう一度試してください");
        setProgress(Math.round(((i + 1) / st.uploads.length) * 100));
      }
      setProgress(null);
      const run = await runReel(st.id);
      if ("error" in run) throw new Error(run.error);
      setBusy("準備しています");
      // できるまで数秒ごとに聞く
      for (;;) {
        await new Promise((ok) => setTimeout(ok, 3000));
        const s = await reelStatus(st.id);
        if ("error" in s && !("status" in s)) throw new Error(s.error);
        if (!("status" in s)) continue;
        if (s.status === "done" && "url" in s) {
          setResult({ url: s.url, downloadUrl: s.downloadUrl, fileName: s.fileName });
          break;
        }
        if (s.status === "error") throw new Error(s.error || "作れませんでした");
        setBusy(s.stage || "作っています");
      }
      setFile(null);
      if (pick.current) pick.current.value = "";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setProgress(null);
      router.refresh();
    }
  };

  const share = async () => {
    if (shareFile && navigator.canShare?.({ files: [shareFile] })) {
      try {
        await navigator.share({ files: [shareFile] });
        return;
      } catch {
        return; // 閉じただけ
      }
    }
    if (result?.downloadUrl) location.href = result.downloadUrl;
  };

  const chip = (on: boolean) => `rounded-full border px-4 py-2 text-sm font-bold ${on ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-600"}`;

  if (result)
    return (
      <div className="space-y-3 rounded-md border border-line bg-white p-4">
        <p className="text-sm font-bold text-emerald-700">できました</p>
        {result.url && <video src={result.url} controls playsInline className="mx-auto aspect-[9/16] max-h-[70vh] w-auto rounded bg-black" />}
        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={share} className="rounded-lg bg-brand px-4 py-3 text-sm font-bold text-white">
            {shareFile ? "保存・共有する（写真に保存→インスタへ）" : "読み込んでいます…"}
          </button>
          {result.downloadUrl && (
            <a href={result.downloadUrl} className="rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700">
              ダウンロード
            </a>
          )}
        </div>
        <p className="text-xs text-slate-500">iPhone は「保存・共有する」→「ビデオを保存」で写真に入ります。そのままインスタのリールで選べます</p>
        <button onClick={() => setResult(null)} className="text-sm font-bold text-brand">
          ＋ 次のリールを作る
        </button>
      </div>
    );

  return (
    <div className="space-y-5 rounded-md border border-line bg-white p-4">
      <div>
        <p className="text-sm font-bold text-slate-800">1. 動画を選ぶ</p>
        <input ref={pick} type="file" accept="video/*" disabled={!!busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-4 file:py-2 file:font-bold file:text-brand" />
        {file && <p className="mt-1 text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(0)}MB</p>}
      </div>

      <div>
        <p className="text-sm font-bold text-slate-800">2. 仕上がりの秒数</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SECONDS.map((s) => (
            <button key={s} type="button" disabled={!!busy} onClick={() => setSeconds(s)} className={chip(seconds === s)}>
              {s}秒
            </button>
          ))}
          <label className="flex items-center gap-1 text-sm text-slate-600">
            <input type="number" min={5} max={90} value={seconds} disabled={!!busy} onChange={(e) => setSeconds(Number(e.target.value))} className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-right" />秒
          </label>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-slate-800">3. BGM</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {bgm.length > 0 && (
            <>
              <button type="button" disabled={!!busy} onClick={() => setBgmMode("auto")} className={chip(bgmMode === "auto")}>
                おまかせ
              </button>
              <button type="button" disabled={!!busy} onClick={() => setBgmMode("pick")} className={chip(bgmMode === "pick")}>
                曲を選ぶ
              </button>
            </>
          )}
          <button type="button" disabled={!!busy} onClick={() => setBgmMode("none")} className={chip(bgmMode === "none")}>
            なし（インスタで付ける）
          </button>
        </div>
        {bgmMode === "pick" && (
          <select value={bgmId} onChange={(e) => setBgmId(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {bgm.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}（{b.mood}）
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <p className="text-sm font-bold text-slate-800">
          4. AI へのひとこと <span className="font-normal text-slate-400">（なくてもよい）</span>
        </p>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} disabled={!!busy} maxLength={200} placeholder="例：新メニューの角煮。湯気のところを使って" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      {error && <p className="rounded bg-accent-soft/40 px-3 py-2 text-sm text-accent">{error}</p>}
      {busy ? (
        <div className="rounded-lg bg-brand-soft px-4 py-3 text-sm font-bold text-brand">
          <p>
            {busy}
            {progress !== null ? `… ${progress}%` : "…"}
          </p>
          <p className="mt-1 text-xs font-normal">1〜3分かかります。この画面を開いたまま待ってください</p>
        </div>
      ) : (
        <button onClick={start} disabled={!file} className="w-full rounded-lg bg-brand px-4 py-3 text-base font-bold text-white disabled:opacity-40">
          スタート
        </button>
      )}
    </div>
  );
}
