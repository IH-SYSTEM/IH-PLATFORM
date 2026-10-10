-- 担当（2026-10-10 黒田さん決定）。権限を「立場（見られる範囲）」と「担当（入力・承認できる仕事）」の2本に分ける。
-- 管理者でも、担当がなければ見るだけ。代表も見るだけ（最終の承認だけはできる。これはアプリ側で確かめる）。
-- 1人が複数の担当を持てる（兼任）。ただし同じ人が持ってはいけない組み合わせ（入力と承認）がある

create table if not exists duties (
  key text primary key,
  label text not null,
  description text not null,
  exclusive_with text[] not null default '{}', -- 同じ人が一緒に持てない担当
  sort_order int not null default 0
);

insert into duties (key, label, description, exclusive_with, sort_order) values
  ('keiri_input', '経理（入力）', '給与の入力（下書き）・給与の取り込み・売上データの取り込み', '{keiri_approve}', 10),
  ('keiri_approve', '経理（承認）', '入力された給与の確定・差し戻し（入力した本人は確定できない）', '{keiri_input}', 20),
  ('soumu', '総務', 'スタッフ登録・時給・仮パスワード、会社・店舗マスタ、勤怠の修正、報告の承認、お知らせ', '{}', 30),
  ('jinji', '人事・教育', '店長研修の作成と修了の管理、店長・スタッフの相談の受付', '{}', 40),
  ('system', 'システム', '立場（権限）と担当の割り当て、LINE配信、打刻画面のキー発行', '{}', 50)
on conflict (key) do update set label = excluded.label, description = excluded.description, exclusive_with = excluded.exclusive_with, sort_order = excluded.sort_order;

create table if not exists staff_duties (
  staff_id text not null references staff(id) on delete cascade,
  duty text not null references duties(key),
  granted_by text references staff(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (staff_id, duty)
);

alter table duties enable row level security;
alter table staff_duties enable row level security;
drop policy if exists duties_read on duties;
create policy duties_read on duties for select to authenticated using (true);
drop policy if exists staff_duties_read on staff_duties;
create policy staff_duties_read on staff_duties for select to authenticated using (is_admin());
-- 担当の付け外しはサーバー（service role）が、割り当てられる人かと組み合わせを確かめてから行う

-- ログイン中の人がその担当を持っているか（管理者のときだけ有効）
create or replace function has_duty(d text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff s join staff_duties sd on sd.staff_id = s.id
    where s.auth_user_id = auth.uid() and s.retired = false
      and s.permission in ('admin', 'superadmin') and sd.duty = d
  )
$$;

-- 管理者の書き込みを、担当のある人だけにする（見るのは今までどおり管理者全員）
drop policy if exists stores_admin_write on stores;
create policy stores_admin_write on stores for all to authenticated using (has_duty('soumu')) with check (has_duty('soumu'));
drop policy if exists companies_admin_write on companies;
create policy companies_admin_write on companies for all to authenticated using (has_duty('soumu')) with check (has_duty('soumu'));
drop policy if exists staff_admin_write on staff;
create policy staff_admin_write on staff for all to authenticated using (has_duty('soumu') or has_duty('system')) with check (has_duty('soumu') or has_duty('system'));
drop policy if exists salary_admin_write on salary_records;
create policy salary_admin_write on salary_records for all to authenticated using (has_duty('keiri_input') or has_duty('keiri_approve')) with check (has_duty('keiri_input') or has_duty('keiri_approve'));
drop policy if exists attendance_admin_write on attendance;
create policy attendance_admin_write on attendance for all to authenticated using (has_duty('soumu')) with check (has_duty('soumu'));
drop policy if exists announcements_admin_write on announcements;
create policy announcements_admin_write on announcements for all to authenticated using (has_duty('soumu')) with check (has_duty('soumu'));
drop policy if exists store_display_keys_admin on store_display_keys;
create policy store_display_keys_admin on store_display_keys for all to authenticated using (has_duty('system')) with check (has_duty('system'));
-- 報告の承認はサーバー（service role）が、種類ごとの担当を確かめてから行う。画面から直接は書かせない
drop policy if exists reports_admin_write on reports;

-- 給与の「入力した人」と「確定した人」（同じ人は確定できない）
alter table salary_records add column if not exists drafted_by text references staff(id) on delete set null;
alter table salary_records add column if not exists confirmed_by text references staff(id) on delete set null;
alter table salary_records add column if not exists confirmed_at timestamptz;
