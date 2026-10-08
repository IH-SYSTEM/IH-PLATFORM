import { test } from "node:test";
import assert from "node:assert/strict";
import { describePayload, parsePayload, type Field } from "../lib/reports/fields.ts";

const fields: Field[] = [
  { key: "amount", label: "差額", kind: "amount", min: -1000000, max: 1000000 },
  { key: "time", label: "時刻", kind: "time", optional: true },
  { key: "detail", label: "内容", kind: "longtext", max: 10 },
  { key: "photo", label: "写真", kind: "photo" },
];
const get = (o: Record<string, string>) => (k: string) => o[k] ?? null;

test("金額 — マイナス・カンマ・円を受け付け、範囲外ははじく", () => {
  const r = parsePayload(fields, get({ amount: "-1,000円", detail: "ok" }));
  assert.ok("payload" in r && r.payload.amount === -1000);
  assert.ok("error" in parsePayload(fields, get({ amount: "2000000", detail: "ok" })));
  assert.ok("error" in parsePayload(fields, get({ amount: "1.5", detail: "ok" })));
});

test("任意の時刻と写真は空でよい。長文は上限を守る", () => {
  const r = parsePayload(fields, get({ amount: "0", detail: "0123456789" }));
  assert.ok("payload" in r && !("time" in r.payload) && !("photo" in r.payload));
  assert.ok("error" in parsePayload(fields, get({ amount: "0", detail: "01234567890" })));
});

test("写真はファイルの番号の形だけ受け付ける", () => {
  assert.ok("error" in parsePayload(fields, get({ amount: "0", detail: "x", photo: "../etc/passwd" })));
  const id = "0b5f2c1e-1234-4abc-9def-0123456789ab";
  const r = parsePayload(fields, get({ amount: "0", detail: "x", photo: id }));
  assert.ok("payload" in r && r.payload.photo === id);
});

test("表示 — 金額は符号つき、写真は印つき", () => {
  const d = describePayload(fields, { amount: 500, detail: "x", photo: "0b5f2c1e-1234-4abc-9def-0123456789ab" });
  assert.equal(d.find((x) => x.label === "差額")?.value, "+500円");
  assert.ok(d.some((x) => "photo" in x));
});
