-- 自分の予定（2026-10-16 黒田さん：「スケジュールは確定シフトのほかに、自分の予定を入れて使えるように」）。
-- 本人だけが見る・入れる・直す・消す。読み書きはサーバー（service role）が本人を確かめてから行う
create table if not exists personal_events (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id) on delete cascade,
  event_date date not null,
  start_time time,                       -- 空なら終日
  end_time time,
  title text not null check (char_length(title) between 1 and 60),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_events_staff_date_idx on personal_events(staff_id, event_date);
alter table personal_events enable row level security;
