// 給与設定の履歴の1回目の作成。旧システムの確定済み明細（月ごとの時給）と、今の給与マスタから作る。履歴が既にある人は飛ばす
//   node --env-file=.env.local scripts/seed-wage-history.mjs        … 予定を表示
//   node --env-file=.env.local scripts/seed-wage-history.mjs apply  … 書き込む
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv[2] === "apply";
const KEY = { monthly: "baseSalary", daily: "dailyWage", hourly: "hourlyWage", contract: "contractAmount" };
const first = (y, m) => `${y}-${String(m).padStart(2, "0")}-01`;
const dayBefore = (d) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const nextMonth = (d) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 1)).toISOString().slice(0, 10);

const { data: staff } = await sb.from("staff").select("id, name, hire_date, retired, payroll_master").eq("retired", false);
const { data: recs } = await sb.from("salary_records").select("staff_id, year, month, employment_type, attendance").eq("status", "confirmed").order("year").order("month");
const { data: existing } = await sb.from("staff_wage_history").select("staff_id");
const has = new Set((existing ?? []).map((e) => e.staff_id));

const plan = [];
for (const s of staff) {
  if (has.has(s.id)) continue;
  const m = s.payroll_master ?? {};
  const type = m.employmentType;
  const amount = Number(m[KEY[type]] ?? 0);
  if (!KEY[type] || !amount) continue;
  const mine = recs.filter((r) => r.staff_id === s.id && !(r.year === 2026 && r.month === 10) && r.employment_type === type);
  const start = mine.length ? first(mine[0].year, mine[0].month) : s.hire_date || "2026-10-01";
  let rows = [];
  if (type === "hourly") {
    for (const r of mine) {
      const w = Number(r.attendance?.hourlyWage ?? 0);
      if (!w) continue;
      if (!rows.length || rows.at(-1).amount !== w) rows.push({ from: rows.length ? first(r.year, r.month) : start, amount: w });
    }
    if (!rows.length || rows.at(-1).amount !== amount) {
      const last = mine.at(-1);
      rows.push({ from: rows.length && last ? nextMonth(first(last.year, last.month)) : start, amount });
    }
  } else rows = [{ from: start, amount }];
  rows = rows.map((r, i) => ({ staff_id: s.id, valid_from: r.from, valid_to: rows[i + 1] ? dayBefore(rows[i + 1].from) : null, employment_type: type, amount: r.amount, note: "旧システムの明細から作成" }));
  plan.push({ name: s.name, rows });
}
for (const p of plan) console.log(p.name, p.rows.map((r) => `${r.valid_from}〜${r.valid_to ?? ""} ${r.employment_type} ${r.amount}`).join(" / "));
console.log(`${plan.length}名`);
if (APPLY) {
  const { error } = await sb.from("staff_wage_history").insert(plan.flatMap((p) => p.rows));
  console.log(error?.message ?? "書き込みました");
}
