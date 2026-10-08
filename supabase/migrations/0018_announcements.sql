-- ホームに出す「会社からのお知らせ」「システムの更新」「全国ニュース」（2026-10-08 黒田さん要望）
--   notice … 会社からのお知らせ（全員・会社・店舗を選んで出す）
--   system … システムの更新のお知らせ（新しい機能・変更点）
--   news   … 全国ニュース（取り上げるべき記事のリンク。本部が選んで貼る）
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('notice', 'system', 'news')),
  title text not null check (char_length(title) <= 100),
  body text check (char_length(body) <= 2000),
  url text check (url ~ '^https://'),
  source text check (char_length(source) <= 50),       -- ニュースの出どころ（例：NHK）
  audience text not null default 'all' check (audience in ('all', 'company', 'store')),
  audience_ids text[] not null default '{}',            -- 会社・店舗の id
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_kind_idx on announcements(kind, published_at desc);

alter table announcements enable row level security;
drop policy if exists announcements_select on announcements;
create policy announcements_select on announcements for select to authenticated using (true);
drop policy if exists announcements_admin_write on announcements;
create policy announcements_admin_write on announcements for all to authenticated using (is_admin()) with check (is_admin());

-- システムの更新：最近公開した機能
insert into announcements (kind, title, body, published_at) values
  ('system', '画面のデザインを統一しました', 'PCは左のメニュー、スマホは下のメニューから、どの画面にも移れます。', now() - interval '3 hours'),
  ('system', '報告窓口に種類が増えました', '欠勤・遅刻・早退の届け、証明書の発行依頼、事故・ヒヤリハット、設備の故障、レジの差異、クレーム、目安箱、ハラスメントの相談を送れます。', now() - interval '2 hours'),
  ('system', 'アルバイトのシフト希望が新しくなりました', '入れる日を選ぶだけで、いつもの時間が入ります。4週先まで出せます。', now() - interval '1 hour');
