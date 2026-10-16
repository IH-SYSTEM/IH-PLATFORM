import type { NextRequest } from "next/server";

/**
 * 店舗の iPad に出しっぱなしにする打刻QRの掲示ページ。ログイン不要で、URL の掲示キーで保護する。
 *
 * 2026-10-16：古い iPad（iOS 15 など）の Safari では、ポータルの見た目（Tailwind）とプログラム（React）が読めず、
 * 背景が白・文字が左上に寄り、位置情報も聞けないまま止まった。そのため、このページだけは React を使わず、
 * 見た目とプログラムをこの1枚の HTML に入れる（古い書き方の JavaScript だけを使う）。
 *   ・現在地を追い、取れたら /api/punch/display/[code] にQRを取りに行く（3秒ごと）
 *   ・4秒たっても位置が取れなければ「位置情報を許可する」ボタン（押したときに聞き直す＝iPad で許可のメッセージを出すため）
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(request: NextRequest, ctx: RouteContext<"/punch/display/[code]">) {
  const { code } = await ctx.params;
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const manifest = `/punch/display/${encodeURIComponent(code)}/manifest.webmanifest?key=${encodeURIComponent(key)}`;
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>打刻QR</title>
<link rel="manifest" href="${esc(manifest)}">
<link rel="apple-touch-icon" href="/apple-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="打刻 ${esc(code)}">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#011b4a">
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body { background: #011b4a; color: #fff; font-family: -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif; -webkit-text-size-adjust: 100%; }
  .wrap { min-height: 100%; display: -webkit-box; display: -webkit-flex; display: flex; -webkit-flex-direction: column; flex-direction: column; box-sizing: border-box; }
  header { display: -webkit-flex; display: flex; -webkit-justify-content: space-between; justify-content: space-between; -webkit-align-items: flex-end; align-items: flex-end; padding: 32px 32px 0; }
  .brand { font-size: 14px; letter-spacing: 0.2em; color: rgba(255,255,255,0.6); margin: 0; }
  h1 { font-size: 30px; margin: 4px 0 0; }
  .clock { text-align: right; font-variant-numeric: tabular-nums; }
  .date { font-size: 24px; font-weight: bold; margin: 0; }
  .time { font-size: 48px; font-weight: bold; margin: 0; }
  main { -webkit-flex: 1; flex: 1; display: -webkit-flex; display: flex; -webkit-flex-direction: column; flex-direction: column; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center; padding: 32px; text-align: center; }
  .qr { background: #fff; border-radius: 12px; padding: 16px; width: 60vh; height: 60vh; max-width: 70vw; max-height: 70vw; box-sizing: border-box; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .lead { font-size: 24px; font-weight: bold; margin: 24px 0 0; }
  .sub { color: rgba(255,255,255,0.7); margin: 8px 0 0; }
  .remain { color: rgba(255,255,255,0.5); font-size: 14px; margin: 12px 0 0; font-variant-numeric: tabular-nums; }
  .msg { max-width: 560px; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 24px; font-size: 18px; font-weight: bold; line-height: 1.6; margin: 0; }
  .hint { max-width: 560px; color: rgba(255,255,255,0.6); font-size: 14px; line-height: 1.6; margin: 16px 0 0; }
  .btn { margin-top: 24px; border-radius: 999px; font-size: 18px; font-weight: bold; padding: 14px 32px; border: 1px solid rgba(255,255,255,0.4); background: transparent; color: #fff; -webkit-appearance: none; }
  .btn.primary { background: #fff; color: #011b4a; border-color: #fff; font-size: 22px; padding: 16px 40px; }
  .offline { background: #c2410c; padding: 12px 32px; text-align: center; font-weight: bold; margin: 0; }
  .hide { display: none; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div><p class="brand">IKKOU HOLDINGS 打刻</p><h1 id="store">打刻QR</h1></div>
    <div class="clock"><p class="date" id="date"></p><p class="time" id="time"></p></div>
  </header>
  <main>
    <div id="qrbox" class="hide">
      <div class="qr" id="qr"></div>
      <p class="lead">スマートフォンのカメラで読み取ってください</p>
      <p class="sub">出勤・退勤のどちらも、このQRから打刻します（1人読み取るごとに新しいQRに変わります）</p>
      <p class="remain" id="remain"></p>
    </div>
    <p class="msg" id="msg">この端末の位置情報を確認しています…</p>
    <button type="button" class="btn primary hide" id="allow">位置情報を許可する</button>
    <p class="hint hide" id="hint">許可のメッセージが出ないとき：iPad の「設定 → プライバシーとセキュリティ → 位置情報サービス」をオンにし、「Safari Web サイト」を「使用中のみ許可」にしてから、このボタンを押してください。ホーム画面のアイコンで出ないときは、Safari でこのページを開いて押してください</p>
    <button type="button" class="btn" id="refresh">QRを更新</button>
  </main>
  <p class="offline hide" id="offline">通信できません。回復するまで打刻できないため、打刻できなかった時刻は後で修正してください</p>
</div>
<script>
(function () {
  var CODE = ${JSON.stringify(code)};
  var KEY = ${JSON.stringify(key)};
  var pos = null, board = null, waitingTimer = null;
  function $(id) { return document.getElementById(id); }
  function show(id, on) { var el = $(id); if (on) { el.className = el.className.replace(/\\s*hide/g, ""); } else if (el.className.indexOf("hide") < 0) { el.className += " hide"; } }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function jst() { var d = new Date(); return new Date(d.getTime() + (d.getTimezoneOffset() + 540) * 60000); }
  function tick() {
    var d = jst();
    $("date").textContent = d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日(" + WD[d.getDay()] + ")";
    $("time").textContent = pad(d.getHours()) + ":" + pad(d.getMinutes());
    if (board) {
      var s = Math.max(0, Math.ceil((Date.parse(board.expiresAt) - new Date().getTime()) / 1000));
      $("remain").textContent = "このQRの残り時間 " + Math.floor(s / 60) + ":" + pad(s % 60);
    }
  }
  function message(text) { $("msg").textContent = text; show("msg", true); show("qrbox", false); }
  function needButton(text) { message(text); show("allow", true); show("hint", true); }

  function load(fresh) {
    if (!pos) return;
    var q = "key=" + encodeURIComponent(KEY) + "&lat=" + pos.latitude + "&lng=" + pos.longitude + "&acc=" + pos.accuracy + (fresh ? "&fresh=1" : "") + "&_=" + new Date().getTime();
    var x = new XMLHttpRequest();
    x.open("GET", "/api/punch/display/" + encodeURIComponent(CODE) + "?" + q, true);
    x.timeout = 15000;
    x.onload = function () {
      show("offline", false);
      var b = null;
      try { b = JSON.parse(x.responseText); } catch (e) {}
      if (!b) { message("QRを用意できませんでした"); return; }
      if (b.store && b.store.name) { $("store").textContent = b.store.name; document.title = "打刻QR " + b.store.name; }
      if (x.status !== 200) {
        var acc = b.reason === "too_far" && b.accuracy ? "（位置の誤差 約" + b.accuracy + "m）" : "";
        board = null;
        message((b.error || "QRを表示できません") + acc);
        return;
      }
      if (!board || board.token !== b.token) { $("qr").innerHTML = b.svg; }
      board = b;
      show("msg", false); show("allow", false); show("hint", false); show("qrbox", true);
      tick();
    };
    x.onerror = x.ontimeout = function () { show("offline", true); };
    x.send();
  }

  function onPos(p) {
    var first = !pos;
    pos = p.coords;
    if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
    show("allow", false); show("hint", false);
    if (first) { message("QRを用意しています…"); load(false); }
  }
  function onErr(e) {
    if (pos) return;
    if (e.code === 1) needButton("位置情報の利用が許可されていないため、QRを表示できません。下の説明のとおり設定してから、ボタンを押してください");
    else if (e.code === 3) needButton("位置情報の取得に時間がかかっています。Wi-Fi に接続されているか確認して、ボタンを押してください");
    else needButton("位置情報を取得できませんでした。Wi-Fi に接続されているか確認して、ボタンを押してください");
  }
  function ask() {
    message("この端末の位置情報を確認しています…");
    show("allow", false);
    navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 });
  }

  if (!navigator.geolocation) {
    message("この端末では位置情報を使えないため、QRを表示できません");
  } else {
    // Wi-Fi の iPad は GPS がないので、高精度は求めない
    navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 });
    waitingTimer = setTimeout(function () {
      if (!pos) needButton("お店の中にあるかを確かめるため、この iPad の位置情報を使います。下のボタンを押して「許可」を選んでください");
    }, 4000);
  }
  $("allow").onclick = ask;
  $("refresh").onclick = function () { if (pos) load(true); else ask(); };
  setInterval(function () { load(false); }, 3000);
  setInterval(tick, 1000);
  tick();
})();
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
