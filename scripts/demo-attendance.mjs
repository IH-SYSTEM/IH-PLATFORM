// 偽の勤怠を入れる／消す（見た目の確認用）。source='demo' だけを触るので本物の打刻には影響しない
//   入れる: node --env-file=.env.local scripts/demo-attendance.mjs insert 2026-10-01 2026-10-08
//   消す  : node --env-file=.env.local scripts/demo-attendance.mjs delete
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const [cmd, from, to] = process.argv.slice(2);

if (cmd === "delete") {
  const { count, error } = await sb.from("attendance").delete({ count: "exact" }).eq("source", "demo");
  console.log(error?.message ?? `消しました: ${count}件`);
  process.exit(0);
}
if (cmd !== "insert" || !from || !to) {
  console.log("使い方: insert YYYY-MM-DD YYYY-MM-DD / delete");
  process.exit(1);
}

const SALON = new Set(["CFM", "SKC", "STY"]);
const { data: stores } = await sb.from("stores").select("id, code");
const codeOf = new Map(stores.map((s) => [s.id, s.code]));
const { data: staff } = await sb.from("staff").select("id, role, store_id, retired");
const people = staff.filter((s) => !s.retired && s.store_id && !["officer", "freelance"].includes(s.role));

// 同じ人・同じ日なら毎回同じ値になるように（入れ直しても形が変わらない）
const rand = (seed) => {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};
const iso = (date, hm, plusDay = 0) => {
  const d = new Date(`${date}T${hm}:00+09:00`);
  return new Date(d.getTime() + plusDay * 86_400_000).toISOString();
};
const hm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const rows = [];
for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
  const date = new Date(t).toISOString().slice(0, 10);
  const dow = new Date(t).getUTCDay();
  for (const p of people) {
    const code = codeOf.get(p.store_id);
    const r = rand(`${p.id}:${date}`);
    const jitter = Math.round((rand(`${date}:${p.id}`) - 0.5) * 20); // ±10分
    let start, end, brk, works;
    if (code === "IH") [works, start, end, brk] = [dow >= 1 && dow <= 5, 9 * 60, 18 * 60, 60];
    else if (SALON.has(code)) [works, start, end, brk] = [p.role === "parttime" ? r < 0.5 : dow !== 2 && r < 0.85, p.role === "parttime" ? 10 * 60 : 9 * 60 + 30, p.role === "parttime" ? 16 * 60 : 19 * 60, p.role === "parttime" ? 0 : 60];
    else [works, start, end, brk] = [p.role === "parttime" ? r < 0.55 : r < 0.85, p.role === "parttime" ? 17 * 60 : 15 * 60, p.role === "parttime" ? 23 * 60 : 24 * 60, p.role === "parttime" ? 0 : 60];
    if (!works) continue;
    const s = start + jitter;
    const e = end + Math.round((r - 0.5) * 40); // 終わりは ±20分
    const open = rand(`open:${p.id}:${date}`) < 0.01; // まれに退勤の打刻忘れ
    rows.push({
      staff_id: p.id,
      store_id: p.store_id,
      date,
      checkin_time: iso(date, hm(s)),
      checkout_time: open ? null : iso(date, hm(e), e >= 24 * 60 ? 1 : 0),
      break_minutes: brk,
      source: "demo",
    });
  }
}
const { error } = await sb.from("attendance").upsert(rows, { onConflict: "staff_id,date", ignoreDuplicates: true });
console.log(error?.message ?? `入れました: ${rows.length}件（${people.length}名・${from}〜${to}、退勤なし ${rows.filter((r) => !r.checkout_time).length}件）`);
