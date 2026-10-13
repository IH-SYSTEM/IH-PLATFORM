-- 機能のモジュール化と、ワークボード（2026-10-13 黒田さん要望）
--
-- ■ モジュール：付けたり外したりできる機能の単位（ワークボード、これからの棚卸し・美化・研修など）。
--   誰が使えるかは「立場（一般・店長・管理者）」「担当（経理・総務…）」「個人」のどれかに割り当てる。
--   給与入力・スタッフ登録などの基本の仕事は、今までどおり担当で決まる（権限付与の画面で一覧できる）
-- ■ ワークボード：打刻のときに、お知らせを必ず確かめてもらう仕組み（COOKIE for MEN の CRM から移植）。
--   出勤前のお知らせを全部確認しないと出勤できない。退勤前のお知らせとチェックリストを済ませないと退勤できない

create table if not exists modules (
  key text primary key,
  label text not null,
  description text not null,
  sort_order int not null default 0
);
insert into modules (key, label, description, sort_order) values
  ('workboard', 'ワークボード', '打刻のときに必ず確かめてもらうお知らせ（出勤前・退勤前）、定期配信、退勤チェックリスト、確認状況', 10)
on conflict (key) do update set label = excluded.label, description = excluded.description, sort_order = excluded.sort_order;

-- 割り当て：grantee_type = position（立場：member/store/admin）・duty（担当）・staff（個人）
create table if not exists module_grants (
  module text not null references modules(key) on delete cascade,
  grantee_type text not null check (grantee_type in ('position', 'duty', 'staff')),
  grantee text not null,
  granted_by text references staff(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (module, grantee_type, grantee)
);
-- はじめの割り当て：ワークボードは店長と総務
insert into module_grants (module, grantee_type, grantee) values ('workboard', 'position', 'store'), ('workboard', 'duty', 'soumu')
on conflict do nothing;

-- ===== ワークボード =====
create table if not exists workboard_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 100),
  body text not null check (char_length(body) <= 2000),
  importance text not null default 'お知らせ' check (importance in ('重要', '確認', '指示', 'お知らせ', 'その他')),
  timing text not null default 'check_in' check (timing in ('check_in', 'check_out')),
  audience text not null default 'store' check (audience in ('all', 'store', 'staff')),
  audience_ids text[] not null default '{}',          -- 店舗の id か、スタッフの id
  starts_on date not null,                             -- この日から出す
  ends_on date,                                        -- この日まで（空なら、確認するまで出し続ける）
  schedule_id uuid,                                    -- 定期配信から作ったもの
  is_active boolean not null default true,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists workboard_notices_active_idx on workboard_notices(is_active, starts_on);

create table if not exists workboard_reads (
  notice_id uuid not null references workboard_notices(id) on delete cascade,
  staff_id text not null references staff(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (notice_id, staff_id)
);

create table if not exists workboard_schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 100),
  body text not null check (char_length(body) <= 2000),
  importance text not null default 'お知らせ' check (importance in ('重要', '確認', '指示', 'お知らせ', 'その他')),
  timing text not null default 'check_in' check (timing in ('check_in', 'check_out')),
  audience text not null default 'store' check (audience in ('all', 'store', 'staff')),
  audience_ids text[] not null default '{}',
  recurrence text not null check (recurrence in ('monthly', 'weekly', 'once')),
  day_of_month int check (day_of_month between 1 and 31),  -- 毎月（月末より大きい日は月末）
  day_of_week int check (day_of_week between 0 and 6),     -- 毎週（0=日曜）
  on_date date,                                            -- 1回だけ
  is_active boolean not null default true,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint workboard_schedule_fields check (
    (recurrence = 'monthly' and day_of_month is not null) or
    (recurrence = 'weekly' and day_of_week is not null) or
    (recurrence = 'once' and on_date is not null)
  )
);
alter table workboard_notices drop constraint if exists workboard_notices_schedule_fk;
alter table workboard_notices add constraint workboard_notices_schedule_fk foreign key (schedule_id) references workboard_schedules(id) on delete set null;
-- 同じ定期配信から、同じ日に2つ作らない
create unique index if not exists workboard_notices_schedule_day on workboard_notices(schedule_id, starts_on) where schedule_id is not null;

-- 退勤チェックリスト（店ごと。store_id が空なら全店）
create table if not exists workboard_checklist_items (
  id uuid primary key default gen_random_uuid(),
  store_id text references stores(id) on delete cascade,
  label text not null check (char_length(label) <= 100),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists workboard_checklist_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid references attendance(id) on delete cascade,
  staff_id text not null references staff(id) on delete cascade,
  store_id text references stores(id) on delete set null,
  items jsonb not null,                                -- [{id, label}] 済ませた項目（そのときの文言で残す）
  completed_at timestamptz not null default now()
);

-- 読み書きはすべてサーバー（service role）が、モジュールの割り当てと本人を確かめてから行う
alter table modules enable row level security;
alter table module_grants enable row level security;
alter table workboard_notices enable row level security;
alter table workboard_reads enable row level security;
alter table workboard_schedules enable row level security;
alter table workboard_checklist_items enable row level security;
alter table workboard_checklist_logs enable row level security;
drop policy if exists modules_read on modules;
create policy modules_read on modules for select to authenticated using (true);
