import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFilter, buildTelops, fitSegments, parseProbe, toOutputTime, wrapJa } from "../lib/reel-plan.ts";

const sum = (s: { start: number; end: number }[]) => Math.round(s.reduce((a, x) => a + x.end - x.start, 0) * 100) / 100;

test("場面の合計を仕上がりの秒数にそろえる（多すぎ）", () => {
  const s = fitSegments([{ start: 0, end: 10 }, { start: 20, end: 40 }], 60, 15);
  assert.equal(sum(s), 15);
  assert.ok(s.every((x) => x.end - x.start >= 0.79));
});

test("足りなければ前後に広げる", () => {
  const s = fitSegments([{ start: 10, end: 12 }, { start: 30, end: 32 }], 60, 15);
  assert.equal(sum(s), 15);
  assert.ok(s[0].start >= 0 && s[1].end <= 60 && s[0].end <= s[1].start);
});

test("元の動画が短ければ元の長さまで", () => {
  assert.equal(sum(fitSegments([{ start: 0, end: 8 }], 8, 30)), 8);
});

test("重なりはまとめ、はみ出しは切る", () => {
  const s = fitSegments([{ start: 5, end: 12, caption: "A" }, { start: 10, end: 14 }, { start: 55, end: 70 }], 60, 14);
  assert.equal(sum(s), 14);
  assert.ok(s.every((x) => x.end <= 60));
});

test("AI が何も返さなくても頭から作る", () => {
  assert.deepEqual(fitSegments([], 40, 15), [{ start: 0, end: 15 }]);
});

test("元の時刻 → 仕上がりの時刻", () => {
  const segs = [{ start: 10, end: 15 }, { start: 30, end: 35 }];
  assert.equal(toOutputTime(segs, 12), 2);
  assert.equal(toOutputTime(segs, 31), 6);
  assert.equal(toOutputTime(segs, 20), null);
});

test("日本語の折り返し", () => {
  assert.deepEqual(wrapJa("今日のおすすめは、とろける角煮です", 10), ["今日のおすすめは、", "とろける角煮です"]);
  assert.deepEqual(wrapJa("短い"), ["短い"]);
});

test("テロップ：キャッチコピーと字幕を仕上がりの時刻で", () => {
  const segs = [{ start: 10, end: 15, caption: "とろける角煮" }, { start: 30, end: 35 }];
  const t = buildTelops(segs, [{ start: 31, end: 34, text: "いらっしゃいませ" }, { start: 20, end: 22, text: "使わない" }]);
  assert.equal(t.length, 2);
  assert.equal(t[0].kind, "catch");
  assert.deepEqual([t[1].start, t[1].end, t[1].text], [6, 9, "いらっしゃいませ"]);
});

test("フィルタ：場面の数だけ並べ、BGMを混ぜる", () => {
  const { filter, total } = buildFilter({
    segs: [{ start: 0, end: 3 }, { start: 5, end: 7 }],
    portrait: false,
    hasAudio: false,
    telops: [{ start: 0, end: 2, file: "/tmp/a b/t0.txt", kind: "catch" }],
    font: "/var/task/assets/fonts/x.ttf",
    bgm: true,
    speechMain: false,
  });
  assert.equal(total, 5);
  assert.match(filter, /concat=n=2:v=1:a=1\[vc\]\[ac\]/);
  assert.match(filter, /\[2:a\]aresample/); // 無音の入力
  assert.match(filter, /\[4:a\]atrim=0:5/); // BGM は最後の入力
  assert.match(filter, /boxblur/); // 横の動画
  assert.match(filter, /enable='between\(t,0,2\)'/);
});

test("ffmpeg の出力を読む（iPhone の縦動画）", () => {
  const p = parseProbe(`  Duration: 00:00:31.53, start: 0.000000, bitrate: 15000 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 1920x1080, 14000 kb/s, 29.98 fps
    Side data:
      displaymatrix: rotation of -90.00 degrees
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 160 kb/s`);
  assert.deepEqual(p, { duration: 31.53, width: 1080, height: 1920, hasAudio: true });
});
