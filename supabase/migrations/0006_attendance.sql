-- 勤怠（打刻の記録）
-- date は JST の営業日（朝5時で切り替え。深夜2時の退勤は前日の勤務）。時刻は timestamptz（UTC）
-- 打刻は「記録」なので実時刻のまま残す。15分丸めやシフトとの突き合わせは給与計算側で行う
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id) on delete cascade,
  store_id text not null references stores(id) on delete restrict,  -- 打刻したQRの店舗（所属店舗ではない）
  date date not null,
  checkin_time timestamptz,
  checkout_time timestamptz,
  break_minutes integer not null default 0 check (break_minutes between 0 and 600),  -- 実際に取った休憩（本人が退勤時に入力）
  checkin_token_id uuid references punch_tokens(id) on delete set null,
  checkout_token_id uuid references punch_tokens(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, date)  -- 1人1日1件（当面。他店への掛け持ちは将来の課題）
);
create index if not exists attendance_date_idx on attendance(date);
create index if not exists attendance_store_date_idx on attendance(store_id, date);
drop trigger if exists attendance_updated_at on attendance;
create trigger attendance_updated_at before update on attendance
  for each row execute function set_updated_at();

alter table attendance enable row level security;
drop policy if exists attendance_select on attendance;
create policy attendance_select on attendance for select to authenticated
  using (is_admin() or staff_id = current_staff_id());
drop policy if exists attendance_admin_write on attendance;
create policy attendance_admin_write on attendance for all to authenticated
  using (is_admin()) with check (is_admin());
-- 打刻の書き込みは API（service role）が、QRトークンと LINE の本人確認を確かめてから行う
