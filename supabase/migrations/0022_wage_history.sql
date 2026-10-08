-- 給与設定の履歴（2026-10-09 黒田さん要望）。「いつから・いつまで・いくら」。終わりの日がない行が今の設定
--   例）2026-06-01〜2026-09-10 時給1,100円 ／ 2026-09-11〜 時給1,200円
--   勤怠から取り込むときは、日ごとにその日の時給で計算する（月の途中で変わっても分けて足す）
create table if not exists staff_wage_history (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id) on delete cascade,
  valid_from date not null,
  valid_to date,
  employment_type text not null check (employment_type in ('monthly', 'daily', 'hourly', 'contract')),
  amount int not null check (amount >= 0),   -- 月給・日給・時給・業務委託額
  note text check (char_length(note) <= 200),
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists staff_wage_history_staff_idx on staff_wage_history(staff_id, valid_from);
create unique index if not exists staff_wage_history_one_open on staff_wage_history(staff_id) where valid_to is null;

alter table staff_wage_history enable row level security;
drop policy if exists staff_wage_history_admin on staff_wage_history;
create policy staff_wage_history_admin on staff_wage_history for select to authenticated using (is_admin());
