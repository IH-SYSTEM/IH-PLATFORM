"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Board = { store: { name: string; code: string }; token: string; expiresAt: string; svg: string };

// QRが読まれて本人確定されたら、次の確認で新しいQRに切り替わる
const POLL_MS = 3000;

const hhmm = (d: Date) =>
  d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
const dateLabel = (d: Date) =>
  d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" });

export function DisplayBoard({ code, displayKey }: { code: string; displayKey: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  // 最新の現在地。QRの取得のたびに送り、店舗から一定距離以内のときだけQRが返ってくる
  const position = useRef<GeolocationCoordinates | null>(null);

  const load = useCallback(
    async (fresh = false) => {
      const pos = position.current;
      if (!pos) return;
      try {
        const q = new URLSearchParams({ key: displayKey, lat: String(pos.latitude), lng: String(pos.longitude), acc: String(pos.accuracy) });
        if (fresh) q.set("fresh", "1");
        const res = await fetch(`/api/punch/display/${encodeURIComponent(code)}?${q}`, { cache: "no-store" });
        const body = await res.json();
        if (body.store?.name) setStoreName(body.store.name);
        if (!res.ok) {
          const acc = body.reason === "too_far" && body.accuracy ? `（位置の誤差 約${body.accuracy}m）` : "";
          setError((body.error ?? "QRを表示できません") + acc);
          setBoard(null);
        } else {
          setError(null);
          setBoard((prev) => (prev?.token === body.token ? prev : body));
        }
        setOffline(false);
      } catch {
        setOffline(true);
      }
    },
    [code, displayKey],
  );

  useEffect(() => {
    const first = setTimeout(() => load(), 0);
    const poll = setInterval(() => load(), POLL_MS);
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  // iPad の現在地を追い続ける。位置が初めて取れた時点ですぐQRを取りに行く
  useEffect(() => {
    if (!navigator.geolocation) {
      const t = setTimeout(() => setGeoError("この端末では位置情報を使えないため、QRを表示できません"), 0);
      return () => clearTimeout(t);
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const first = !position.current;
        position.current = p.coords;
        setGeoError(null);
        if (first) load();
      },
      (e) => {
        setGeoError(
          e.code === e.PERMISSION_DENIED
            ? "位置情報の利用が許可されていないため、QRを表示できません。iPad の「設定 → プライバシーとセキュリティ → 位置情報サービス」で、Safari（またはこのアプリ）の位置情報を「使用中のみ許可」にしてから、ページを開き直してください"
            : "位置情報を取得できませんでした。Wi-Fi に接続されているか確認してください",
        );
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [load]);

  // QRが表示されない・古いままに見えるときに押す。掲示中のQRを失効させて新しいQRを出す
  const refresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  // 掲示中に画面が消えないようにする（対応していない端末では何もしない）
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {}
    };
    const onVisible = () => document.visibilityState === "visible" && acquire();
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  const remainSec = board ? Math.max(0, Math.ceil((Date.parse(board.expiresAt) - now.getTime()) / 1000)) : 0;

  return (
    <main className="flex min-h-dvh flex-col bg-brand text-white">
      <header className="flex items-end justify-between gap-6 px-8 pt-8">
        <div>
          <p className="text-sm tracking-widest text-white/60">IKKOU HOLDINGS 打刻</p>
          <h1 className="mt-1 text-3xl font-bold">{board?.store.name ?? storeName ?? "打刻QR"}</h1>
        </div>
        <div className="text-right tabular-nums">
          <p className="text-2xl font-bold">{dateLabel(now)}</p>
          <p className="text-5xl font-bold">{hhmm(now)}</p>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-8">
        {geoError || error ? (
          <p className="max-w-lg rounded-md bg-white/10 p-6 text-center text-lg font-bold">{geoError ?? error}</p>
        ) : board ? (
          <>
            <div
              className="aspect-square w-[min(70vw,60vh)] rounded-lg bg-white p-4 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: board.svg }}
            />
            <div className="text-center">
              <p className="text-2xl font-bold">スマートフォンのカメラで読み取ってください</p>
              <p className="mt-2 text-white/70">
                出勤・退勤のどちらも、このQRから打刻します（1人読み取るごとに新しいQRに変わります）
              </p>
              <p className="mt-3 text-sm tabular-nums text-white/50">
                このQRの残り時間 {Math.floor(remainSec / 60)}:{String(remainSec % 60).padStart(2, "0")}
              </p>
            </div>
          </>
        ) : (
          <p className="text-white/70">この端末の位置情報を確認しています…</p>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="rounded-full border border-white/40 px-8 py-3 text-lg font-bold text-white hover:bg-white/10 active:bg-white/20 disabled:opacity-50"
        >
          {refreshing ? "更新中…" : "QRを更新"}
        </button>
      </section>

      {offline && (
        <p className="bg-accent px-8 py-3 text-center font-bold">
          通信できません。回復するまで打刻できないため、打刻できなかった時刻は後で修正してください
        </p>
      )}
    </main>
  );
}
