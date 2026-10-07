-- 報告窓口：現場から本部への連絡を1か所に集める共通の仕組み
-- 報告の種類（入力欄・承認したときの処理）はコード（lib/reports）で定義し、ここには中身だけを保存する
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  type text not null,                 -- 例: attendance.check_in
  type_version integer not null,      -- 入力欄を変えても、昔の報告を昔の形で読めるように
  category text not null,             -- 例: attendance
  store_id text references stores(id) on delete set null,
  reporter_id text not null references staff(id) on delete restrict,
  subject_staff_id text references staff(id) on delete set null,
  payload jsonb not null,
  on_site boolean,                    -- 報告した端末が店舗の打刻範囲内にあったか（null=位置を確認できず）
  distance_m integer,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by text references staff(id) on delete set null,
  reviewed_at timestamptz,
  applied jsonb,                      -- 承認で反映したもの（例: {"attendance_id": "..."}）
  created_at timestamptz not null default now()
);
create index if not exists reports_status_idx on reports(status, created_at desc);
create index if not exists reports_reporter_idx on reports(reporter_id, created_at desc);

alter table reports enable row level security;
drop policy if exists reports_select on reports;
create policy reports_select on reports for select to authenticated
  using (is_admin() or reporter_id = current_staff_id() or subject_staff_id = current_staff_id());
drop policy if exists reports_admin_write on reports;
create policy reports_admin_write on reports for all to authenticated
  using (is_admin()) with check (is_admin());
-- 報告の送信・承認はサーバー（service role）が、権限と入力を確かめてから行う

-- ===== 勤怠：どこから入った記録か =====
alter table attendance add column if not exists source text not null default 'qr';
alter table attendance drop constraint if exists attendance_source_check;
alter table attendance add constraint attendance_source_check check (source in ('qr', 'report', 'admin'));
alter table attendance add column if not exists source_report_id uuid references reports(id) on delete set null;

-- ===== 勤怠の変更履歴（給与の元データなので、誰が・いつ・何を・なぜ変えたかを残す） =====
create table if not exists attendance_edits (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid references attendance(id) on delete set null,
  staff_id text not null references staff(id) on delete cascade,
  date date not null,
  action text not null check (action in ('create', 'update', 'delete')),
  before jsonb,
  after jsonb,
  reason text not null,
  note text,
  report_id uuid references reports(id) on delete set null,
  edited_by text not null references staff(id) on delete restrict,
  edited_at timestamptz not null default now()
);
create index if not exists attendance_edits_staff_idx on attendance_edits(staff_id, date);

alter table attendance_edits enable row level security;
drop policy if exists attendance_edits_admin_select on attendance_edits;
create policy attendance_edits_admin_select on attendance_edits for select to authenticated using (is_admin());
