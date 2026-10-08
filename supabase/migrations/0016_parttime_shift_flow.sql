-- アルバイトのシフト：希望から確定する流れと、急募（2026-10-08 黒田さん決定）
--   ・アルバイトは入れる日と時間だけを希望に出す（自分の「いつもの時間」を初期値にする）
--   ・店長は希望が出ている日だけ確定できる（こちらから入れないか、をなくす）
--   ・人が足りないときは、店長が3日前から「急募」でLINEを送る。応募は希望として入る

-- 本人の「いつもの時間」（希望を出すときの初期値）
alter table staff add column if not exists shift_default_start time;
alter table staff add column if not exists shift_default_end time;

-- 希望がどこから来たか：request＝本人が希望画面で出した／urgent＝急募に応募した
alter table shift_requests add column if not exists source text not null default 'request';
alter table shift_requests drop constraint if exists shift_requests_source_check;
alter table shift_requests add constraint shift_requests_source_check check (source in ('request', 'urgent'));

-- 急募。乱用を防ぐため、同じ店・同じ日は2回まで（アプリ側で確かめる）。本部が回数を見られる
create table if not exists urgent_calls (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id) on delete cascade,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  reason text not null,          -- 選択肢（スタッフのトラブル・急な大型予約・その他）
  note text check (char_length(note) <= 100),
  created_by text not null references staff(id) on delete restrict,
  sent_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists urgent_calls_store_date_idx on urgent_calls(store_id, work_date);

alter table shift_requests add column if not exists urgent_call_id uuid references urgent_calls(id) on delete set null;

alter table urgent_calls enable row level security;
drop policy if exists urgent_calls_select on urgent_calls;
create policy urgent_calls_select on urgent_calls for select to authenticated using (true);
-- 書き込みはサーバー（service role）が、店長・管理者かどうかを確かめてから行う
