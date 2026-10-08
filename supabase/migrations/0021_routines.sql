-- 定型業務（2026-10-09 黒田さん要望「今日やることでスケジュールを自動で指示」）
--   担当者のホーム「本日の業務」に、その期間にやることを出す。
--   check='pos_import' はデータが取り込まれたら自動で完了。'manual' は担当者が「済」を押す。
--   期限（開始日＋grace_days）を過ぎても終わっていなければ赤くし、本部（管理者）のホームにも出す
create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 80),
  href text not null,
  assignee_ids text[] not null default '{}',
  every text not null check (every in ('week', 'month')),
  weekday int check (weekday between 0 and 6),   -- every='week'：0=日 … 1=月
  day int check (day between 1 and 28),          -- every='month'：毎月N日
  grace_days int not null default 1,
  check_kind text not null default 'manual' check (check_kind in ('manual', 'pos_import')),
  check_store_id text references stores(id),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists routine_done (
  routine_id uuid not null references routines(id) on delete cascade,
  period_start date not null,
  done_by text references staff(id) on delete set null,
  done_at timestamptz not null default now(),
  primary key (routine_id, period_start)
);

alter table routines enable row level security;
alter table routine_done enable row level security;
drop policy if exists routines_admin on routines;
create policy routines_admin on routines for select to authenticated using (is_admin());
drop policy if exists routine_done_admin on routine_done;
create policy routine_done_admin on routine_done for select to authenticated using (is_admin());

-- 最初の業務：エアレジのCSV（毎週月曜・火曜まで）と、勤怠の給与取り込み（毎月1日・3日まで）。担当は松﨑さん・植屋さん
insert into routines (title, href, assignee_ids, every, weekday, day, grace_days, check_kind, check_store_id, sort_order)
select v.title, v.href, array['uTJXzIh9HqOjzU2hxF70RO1qjd92', 'W0ZKMeU5Hzfgo9slwCWDTEFfHmI2'], v.every, v.weekday, v.day, v.grace, v.kind, s.id, v.ord
from (values
  ('根っこのエアレジCSVを取り込む', '/admin/imports', 'week', 1, null, 1, 'pos_import', 'NEK', 1),
  ('「一」のエアレジCSVを取り込む', '/admin/imports', 'week', 1, null, 1, 'pos_import', 'ICH', 2),
  ('COOKIE熊本のエアレジCSVを取り込む', '/admin/imports', 'week', 1, null, 1, 'pos_import', 'SKC', 3),
  ('先月の勤怠を給与に取り込む', '/admin/salary', 'month', null, 1, 2, 'manual', null, 10)
) as v(title, href, every, weekday, day, grace, kind, code, ord)
left join stores s on s.code = v.code
where not exists (select 1 from routines);
