"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBgm, setBgmActive, setBgmMood, startBgmUpload } from "./actions";

const MOODS = ["明るい", "落ち着いた", "おしゃれ", "元気"];
const input = "rounded-lg border border-slate-300 px-3 py-2 text-sm";

export function BgmUploader() {
  const router = useRouter();
  const pick = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [mood, setMood] = useState(MOODS[0]);
  const [credit, setCredit] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    const f = pick.current?.files?.[0];
    if (!f) return setMsg("曲のファイル（mp3・m4a）を選んでください");
    setBusy(true);
    setMsg(null);
    try {
      const st = await startBgmUpload(f.name);
      if ("error" in st) throw new Error(st.error);
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { error } = await supabase.storage.from("reels").uploadToSignedUrl(st.path, st.token, f, { contentType: st.contentType });
      if (error) throw new Error("送れませんでした（50MB まで）");
      const r = await addBgm({ path: st.path, name: name || f.name.replace(/\.[^.]+$/, ""), mood, credit });
      if ("error" in r) throw new Error(r.error);
      setName("");
      setCredit("");
      if (pick.current) pick.current.value = "";
      setMsg("登録しました");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2 rounded-md border border-line bg-white p-4 sm:grid-cols-2">
      <input ref={pick} type="file" accept="audio/mpeg,audio/mp4,.mp3,.m4a" className="text-sm sm:col-span-2" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="曲の名前（空ならファイル名）" className={input} />
      <select value={mood} onChange={(e) => setMood(e.target.value)} className={input}>
        {MOODS.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="出どころ・作曲者（例：DOVA-SYNDROME / ◯◯）" className={`${input} sm:col-span-2`} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button onClick={submit} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "登録しています…" : "曲を登録する"}
        </button>
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </div>
    </div>
  );
}

export function BgmRow({ t }: { t: { id: string; name: string; mood: string; credit: string | null; is_active: boolean; url: string | null } }) {
  const [pending, start] = useTransition();
  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${t.is_active ? "" : "opacity-50"}`}>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-800">{t.name}</p>
        {t.credit && <p className="text-xs text-slate-500">{t.credit}</p>}
      </div>
      {t.url && <audio src={t.url} controls preload="none" className="h-8 w-48" />}
      <select defaultValue={t.mood} disabled={pending} onChange={(e) => start(() => setBgmMood(t.id, e.target.value))} className="rounded border border-slate-300 px-2 py-1 text-xs">
        {MOODS.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs text-slate-600">
        <input type="checkbox" defaultChecked={t.is_active} disabled={pending} onChange={(e) => start(() => setBgmActive(t.id, e.target.checked))} />
        使う
      </label>
    </div>
  );
}
