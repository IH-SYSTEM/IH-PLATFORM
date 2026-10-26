-- リールの編集ルール（2026-10-26 黒田さん）：SNS 担当が自分のアカウントに、編集のルールを足していける。
-- 作るたびに、その人の「使う」ルールを AI への指示に入れる
create table if not exists reel_rules (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id) on delete cascade,
  body text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists reel_rules_staff_idx on reel_rules (staff_id, sort_order);
alter table reel_rules enable row level security;

notify pgrst, 'reload schema';
