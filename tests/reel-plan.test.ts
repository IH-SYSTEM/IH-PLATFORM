import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFilter, buildTelops, fitSegments, parseProbe, selectUnits, toOutputTime, weekStartJST, wrapJa } from "../lib/reel-plan.ts";

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
  assert.equal(t[0].font, "DelaGothicOne-Regular.ttf"); // 気持ちの指定がなければ力強い
  assert.deepEqual([t[1].start, t[1].end, t[1].text, t[1].font], [6, 9, "いらっしゃいませ", "ZenMaruGothic-Bold.ttf"]);
});

test("気持ちに合わせたフォント", () => {
  const t = buildTelops([{ start: 0, end: 3, caption: "ほっとする味", emotion: "やさしい" }], []);
  assert.equal(t[0].font, "ZenMaruGothic-Bold.ttf");
});

test("まとまりを大事な順に、秒数に収まるだけ残す（途中では切らない）", () => {
  const units = [
    { start: 0, end: 3, priority: 2, role: "opening" as const },
    { start: 3, end: 9, priority: 1 }, // 6秒の大事な話
    { start: 9, end: 14, priority: 3 },
    { start: 14, end: 16, priority: 4 },
    { start: 20, end: 23, priority: 2, role: "ending" as const },
  ];
  const s = selectUnits(units, 30, 15);
  // 始まり3＋締め3＋大事な話6＝12。次の5秒は入らないので飛ばし、2秒のまとまりを入れて14秒
  assert.deepEqual(s.map((x) => [x.start, x.end]), [[0, 3], [3, 9], [14, 16], [20, 23]]);
  assert.ok(sum(s) <= 15.3);
});

test("どれも入らないほど長いときだけ、いちばん大事なまとまりを切る", () => {
  assert.deepEqual(selectUnits([{ start: 5, end: 40, priority: 1 }], 60, 15).map((x) => [x.start, x.end]), [[5, 20]]);
  assert.deepEqual(selectUnits([], 60, 15), [{ start: 0, end: 15 }]);
});

test("週の始まり（月曜0時・日本時間）", () => {
  assert.equal(weekStartJST(new Date("2026-10-26T06:00:00Z")), "2026-10-25T15:00:00.000Z"); // 月曜の昼 → 月曜0時
  assert.equal(weekStartJST(new Date("2026-10-25T14:59:00Z")), "2026-10-18T15:00:00.000Z"); // 日曜23:59 → 前の月曜
});

test("フィルタ：場面の数だけ並べ、BGMを混ぜる", () => {
  const { filter, total } = buildFilter({
    segs: [{ start: 0, end: 3 }, { start: 5, end: 7 }],
    portrait: false,
    hasAudio: false,
    telops: [{ start: 0, end: 2, file: "/tmp/a b/t0.txt", kind: "catch", font: "DelaGothicOne-Regular.ttf" }],
    fontDir: "/var/task/assets/fonts",
    bgm: true,
    speechMain: false,
  });
  assert.match(filter, /DelaGothicOne-Regular\.ttf/);
  assert.match(filter, /fade=t=out:st=4\.\d+:d=0\.\d+\[vout\]/); // 終わりは消えていく
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
