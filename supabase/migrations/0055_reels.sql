-- リール作成（2026-10-25 黒田さん）：各店の SNS 担当が、動画から Instagram のリールを作る
--   ■ 機能（モジュール）「リール作成」：権限付与で、SNS 担当の人に付ける（はじめは誰にも付いていない）
--   ■ reels      … 作った1本ずつ（上げた動画は分けて保存し、できたら消す。できた動画は残す）
--   ■ reel_bgm   … BGM の曲（本部が登録。雰囲気で「おまかせ」に選ばれる）
--   ■ Storage の reels バケット（非公開。読み書きはサーバーから）

insert into modules (key, label, description, sort_order) values
  ('reel', 'リール作成', '動画を上げて秒数を決めると、見どころのカット・テロップ・BGM を付けた Instagram のリールを作る（SNS 担当）', 20)
on conflict (key) do update set label = excluded.label, description = excluded.description, sort_order = excluded.sort_order;

create table if not exists reel_bgm (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mood text not null default '明るい',       -- 明るい・落ち着いた・おしゃれ・元気
  path text not null,                         -- reels バケットの中（bgm/…）
  credit text,                                -- 出どころ・作曲者（フリー音源の表記が要るとき）
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists reels (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id),
  store_id text references stores(id),
  status text not null default 'uploading',   -- uploading → processing → done / error
  stage text,                                 -- いまの段階（画面に出す）
  target_seconds int not null,
  bgm_mode text not null default 'auto',      -- auto（おまかせ）・pick（曲を選ぶ）・none（なし）
  bgm_id uuid references reel_bgm(id),
  memo text,                                  -- AI へのひとこと（例：新メニューの角煮）
  source_name text,
  source_size bigint,
  chunk_count int not null default 1,
  result_path text,
  duration numeric,
  title text,
  plan jsonb,                                 -- AI が選んだ場面（あとで見直すため）
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reels_staff_idx on reels (staff_id, created_at desc);
create index if not exists reels_store_idx on reels (store_id, created_at desc);

alter table reels enable row level security;
alter table reel_bgm enable row level security;

-- 動画は 45MB ずつに分けて上げる（1ファイル 50MB まで）
insert into storage.buckets (id, name, public, file_size_limit)
values ('reels', 'reels', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

notify pgrst, 'reload schema';
