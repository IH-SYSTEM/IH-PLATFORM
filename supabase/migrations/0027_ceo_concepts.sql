-- 壁打ち（CEO専用）の「コンセプト帳」（2026-10-09 黒田さん要望「その概念を崩さないアドバイス」）
--   AIは提案のたびに、ここに書いた柱とぶつからないかを確かめる。読めるのも書けるのも最高管理者（superadmin）だけ
create table if not exists ceo_concepts (
  id uuid primary key default gen_random_uuid(),
  scope text not null,                 -- 'グループ全体'・'HD'・店舗名など（見出し）
  title text not null check (char_length(title) <= 100),
  body text not null check (char_length(body) <= 4000),
  is_active boolean not null default true,
  sort_order int not null default 0,
  updated_by text references staff(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table ceo_concepts enable row level security;
-- ポリシーなし＝画面からはサーバー（service role）経由でだけ読む。サーバー側で superadmin を確かめる
