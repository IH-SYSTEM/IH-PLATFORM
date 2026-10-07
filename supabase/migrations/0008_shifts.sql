-- シフト：スタッフの希望 → 店長の確定
-- 希望（shift_requests）と確定（shift_schedule）は別の表。打刻・給与は確定だけを見る
-- アルバイトは週単位、社員は月単位で希望を出す（期間と締切は lib/shift-period.ts）

-- ===== 希望 =====
create table if not exists shift_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id) on delete cascade,
  work_date date not null,
  availability text not null check (availability in ('all', 'partial', 'off')),  -- 終日OK／時間指定／休み希望
  preferred_start time,
  preferred_end time,   -- 開始より前なら日をまたぐ
  note text check (char_length(note) <= 100),
  updated_at timestamptz not null default now(),
  unique (staff_id, work_date)
);
create index if not exists shift_requests_date_idx on shift_requests(work_date);

-- 提出の記録。「未提出」と「提出したが全日休み希望」を区別するために必要
create table if not exists shift_request_submissions (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month')),
  period_start date not null,   -- 週なら月曜、月なら1日
  submitted_at timestamptz not null default now(),
  unique (staff_id, period_type, period_start)
);

-- ===== 確定 =====
create table if not exists shift_schedule (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id) on delete cascade,
  store_id text not null references stores(id) on delete restrict,  -- 勤務する店舗（他店へのヘルプもある）
  work_date date not null,
  shift_type text not null default 'work' check (shift_type in ('work', 'off', 'paid_leave', 'special')),
  planned_start time,   -- shift_type = 'work' のときだけ
  planned_end time,     -- 開始以下なら日をまたぐ
  note text check (char_length(note) <= 100),
  updated_by text references staff(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (staff_id, work_date),
  check (shift_type <> 'work' or (planned_start is not null and planned_end is not null))
);
create index if not exists shift_schedule_store_date_idx on shift_schedule(store_id, work_date);

-- 店長が「この週（アルバイト）／この月（社員）を確定」した記録。確定前のシフトはスタッフに見せない
create table if not exists shift_decisions (
  store_id text not null references stores(id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month')),
  period_start date not null,
  decided_by text references staff(id) on delete set null,
  decided_at timestamptz not null default now(),
  primary key (store_id, period_type, period_start)
);

-- ===== RLS =====
-- 店長の画面と提出は、サーバーが範囲（自分の店・自分の分）を確かめてから service role で読み書きする
alter table shift_requests enable row level security;
alter table shift_request_submissions enable row level security;
alter table shift_schedule enable row level security;
alter table shift_decisions enable row level security;

drop policy if exists shift_requests_select on shift_requests;
create policy shift_requests_select on shift_requests for select to authenticated using (is_admin() or staff_id = current_staff_id());
drop policy if exists shift_submissions_select on shift_request_submissions;
create policy shift_submissions_select on shift_request_submissions for select to authenticated using (is_admin() or staff_id = current_staff_id());
drop policy if exists shift_schedule_select on shift_schedule;
create policy shift_schedule_select on shift_schedule for select to authenticated using (is_admin() or staff_id = current_staff_id());
drop policy if exists shift_decisions_select on shift_decisions;
create policy shift_decisions_select on shift_decisions for select to authenticated using (true);
