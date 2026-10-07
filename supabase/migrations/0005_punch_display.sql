-- 打刻QRの掲示（店舗の iPad に出しっぱなしにするページ）
-- 掲示ページは未ログインで開くため、掲示キーを知っている端末だけがQRを取得できるようにする

-- ===== 店舗コード =====
-- 掲示ページの URL（/punch/display/IKK）に使う。iPad のブックマークと打刻の記録に残るので、使い始めたら変えない
alter table stores add column if not exists code text;
alter table stores drop constraint if exists stores_code_format;
alter table stores add constraint stores_code_format check (code ~ '^[A-Z]{2,4}$');
create unique index if not exists stores_code_key on stores(code);

-- ===== 掲示キー =====
-- stores はログイン済みスタッフ全員が読めるため、キーは別の表に置いて管理者だけに見せる
-- （スタッフが PostgREST を直接叩いてキーを取り、家からQRを読むのを防ぐ）
create table if not exists store_display_keys (
  store_id text primary key references stores(id) on delete cascade,
  display_key text not null unique,
  issued_by text references staff(id) on delete set null,
  issued_at timestamptz not null default now()
);
alter table store_display_keys enable row level security;
drop policy if exists store_display_keys_admin on store_display_keys;
create policy store_display_keys_admin on store_display_keys for all to authenticated
  using (is_admin()) with check (is_admin());

-- ===== 打刻トークン =====
-- 1トークン＝1打刻。QRに埋める。状態の遷移はすべて条件付き UPDATE の更新行数で判定する
--   掲示（issued）→ LINE で本人確定（claimed。この瞬間に掲示が次のQRへ切り替わる）→ 打刻（consumed）
create table if not exists punch_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  store_id text not null references stores(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by text references staff(id) on delete set null,
  consumed_at timestamptz,
  action text check (action in ('check_in', 'check_out'))
);
create index if not exists punch_tokens_open_idx on punch_tokens(store_id, expires_at) where claimed_at is null;
alter table punch_tokens enable row level security;
drop policy if exists punch_tokens_admin_select on punch_tokens;
create policy punch_tokens_admin_select on punch_tokens for select to authenticated using (is_admin());
-- 書き込みは API（service role）だけが行う

-- ===== 初期値 =====
update stores set code = 'IKK' where id = 'LywJ9Tlqp2UMSSK2CfG7' and code is null;  -- 一鴻（2026-10-07 確定）
